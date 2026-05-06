/**
 * @file Git adapter — shells out to the `git` CLI. Intentionally minimal
 * for Phase 1: enough to produce a project header + recent commit log.
 *
 * Phase 2 will add `git ls-tree -r --long` + a long-running
 * `git cat-file --batch` subprocess for blob streaming; this file is
 * structured so those additions land cleanly without rewriting the
 * one-shot helpers below.
 */

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** ASCII record/field separators — safer than tabs in commit metadata. */
const RS = "\x1e";
const FS = "\x1f";

/**
 * @typedef {import("./types.js").SourceCommit} SourceCommit
 * @typedef {import("./types.js").SourceFile} SourceFile
 * @typedef {import("./types.js").SourceProject} SourceProject
 * @typedef {import("./types.js").SourceRef} SourceRef
 * @typedef {import("./types.js").SourceSignature} SourceSignature
 * @typedef {import("./types.js").SourceTreeEntry} SourceTreeEntry
 */

export class GitAdapter {
  #repo;

  /** @param {{ repo: string }} options */
  constructor(options) {
    this.#repo = options.repo;
  }

  /**
   * Run a one-shot git command and return stdout (utf8).
   * @param {readonly string[]} args
   * @returns {Promise<string>}
   */
  async #git(args) {
    const { stdout } = await execFileAsync("git", ["-C", this.#repo, ...args], {
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout;
  }

  /**
   * Same as #git, but returns null on non-zero exit instead of throwing.
   * @param {readonly string[]} args
   * @returns {Promise<string | null>}
   */
  async #gitOptional(args) {
    try {
      return await this.#git(args);
    } catch {
      return null;
    }
  }

  /** @returns {Promise<boolean>} */
  async isBare() {
    const out = await this.#git(["rev-parse", "--is-bare-repository"]);
    return out.trim() === "true";
  }

  /**
   * @param {string} repoName
   * @returns {Promise<SourceProject>}
   */
  async resolveProject(repoName) {
    const [bare, headSha, defaultBranch, description] = await Promise.all([
      this.isBare(),
      this.#git(["rev-parse", "HEAD"]).then((s) => s.trim()),
      this.#gitOptional(["symbolic-ref", "--short", "HEAD"]).then((s) => s?.trim() ?? null),
      this.#gitOptional(["show", "HEAD:.gitdescription"]).then((s) => s?.trim() ?? null),
    ]);

    return {
      name: repoName,
      description: description && description.length > 0 ? description : null,
      bare,
      defaultBranch,
      headSha,
      generatedAt: new Date().toISOString(),
      schemaVersion: 1,
    };
  }

  /**
   * Recent commits on the given ref (defaults to HEAD), newest first.
   *
   * Uses ASCII separators in the format string so commit messages
   * containing tabs or pipes can't confuse the parser.
   *
   * @param {{ ref?: string, limit?: number }} [opts]
   * @returns {Promise<SourceCommit[]>}
   */
  async listCommits(opts = {}) {
    const ref = opts.ref ?? "HEAD";
    const limit = opts.limit ?? 50;

    // Field order: sha, parents, author name/email/iso, committer name/email/iso, subject, body
    const fields = ["%H", "%P", "%an", "%ae", "%aI", "%cn", "%ce", "%cI", "%s", "%b"].join(FS);

    // The trailing `--` is required: a ref short-name like
    // `examples/react-three` collides with a working-tree path of the
    // same name and git refuses to disambiguate ("ambiguous argument:
    // both revision and filename"). `--` ends the revision list and
    // tells git the rest (here, nothing) is paths. Same applies to
    // `ls-tree` below; SHA-only callers (`diff-tree`) don't need it.
    const stdout = await this.#git([
      "log",
      `--max-count=${limit}`,
      `--format=${fields}${RS}`,
      ref,
      "--",
    ]);

    const records = stdout
      .split(RS)
      .map((r) => r.trim())
      .filter(Boolean);
    return records.map(parseCommitRecord);
  }

  /**
   * Author-date-only history. Used by the contribution-calendar
   * server component, which only needs the per-day commit count
   * across all reachable refs and would be wasteful to derive by
   * reading every full commit shard.
   *
   * Walks `--all` (every local ref + HEAD) so commits on side
   * branches still light up the calendar — the calendar is meant
   * to be a heat-map of repo activity, not a single ref's history.
   * `--no-merges` excludes merge commits to avoid double-counting
   * when feature branches land via merge commits authored on the
   * same day as the underlying work.
   *
   * @param {{ since?: Date | string }} [opts]
   * @returns {Promise<string[]>} ISO 8601 author dates, one per commit
   */
  async listCommitDates(opts = {}) {
    const args = ["log", "--all", "--no-merges", "--format=%aI"];
    if (opts.since) {
      const since = opts.since instanceof Date ? opts.since.toISOString() : opts.since;
      args.push(`--since=${since}`);
    }
    args.push("--");
    const stdout = await this.#git(args);
    return stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Flat list of all blob entries reachable from the given ref. Uses
   * `git ls-tree -r --long` so we get size + sha in one shot. Trees
   * (directories) are NOT returned by `-r` — we synthesize them in JS
   * by walking the path components, since intermediate dirs are needed
   * for the route table but `ls-tree -r` only lists leaves.
   *
   * The returned entries include both blobs (real ls-tree rows) and
   * synthesized trees (with sha = "" and size = -1). Caller can split
   * by `kind`.
   *
   * @param {string} ref
   * @returns {Promise<SourceTreeEntry[]>}
   */
  async listAllEntries(ref) {
    // Format: <mode> SP <type> SP <object> SP <size> TAB <path>
    // -z gives NUL-delimited records to handle filenames with newlines.
    const stdout = await this.#git([
      "ls-tree",
      "-r",
      "-l",
      "-z",
      ref,
      "--", // see listCommits for why
    ]);

    /** @type {SourceTreeEntry[]} */
    const blobs = [];
    const records = stdout.split("\0").filter(Boolean);
    for (const record of records) {
      // Split on the FIRST tab — paths can contain tabs after the meta.
      const tabIdx = record.indexOf("\t");
      if (tabIdx < 0) continue;
      const meta = record.slice(0, tabIdx);
      const path = record.slice(tabIdx + 1);
      const [mode = "", type = "", sha = "", sizeRaw = ""] = meta.split(/\s+/);
      // `-r` yields only blobs (and submodule "commit" entries).
      // Submodules go into the entries with kind "commit"; size is "-".
      /** @type {SourceTreeEntry["kind"]} */
      const kind = type === "blob" ? "blob" : type === "commit" ? "commit" : "tree";
      const size = sizeRaw === "-" || sizeRaw === "" ? -1 : Number(sizeRaw);
      // Inline POSIX basename — git paths are always forward-slash, no
      // need to pull in node:path/posix just for this.
      const lastSlash = path.lastIndexOf("/");
      const name = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
      blobs.push({
        kind,
        sha,
        name,
        path,
        mode,
        size: Number.isFinite(size) ? size : -1,
      });
    }

    // Synthesize parent tree entries from the unique directory prefixes.
    /** @type {Map<string, SourceTreeEntry>} */
    const treesByPath = new Map();
    for (const entry of blobs) {
      const parts = entry.path.split("/");
      // Drop the leaf name; iterate the prefix dirs.
      for (let i = 1; i < parts.length; i++) {
        const dirPath = parts.slice(0, i).join("/");
        if (treesByPath.has(dirPath)) continue;
        treesByPath.set(dirPath, {
          kind: "tree",
          sha: "",
          name: parts[i - 1] ?? "",
          path: dirPath,
          mode: "040000",
          size: -1,
        });
      }
    }

    return [...blobs, ...treesByPath.values()];
  }

  /**
   * Raw unified diff for a commit against its first parent. Always
   * passes `--root` so the initial commit produces a real diff (vs the
   * empty tree) rather than nothing. `-m --first-parent` makes merge
   * commits produce a diff against parent #1 instead of being silently
   * empty. `-M -C` enables rename and copy detection so the parser can
   * surface them as such instead of as add+delete pairs.
   *
   * @param {string} sha
   * @returns {Promise<string>}
   */
  async readCommitDiff(sha) {
    return await this.#git([
      "diff-tree",
      "--root",
      "-p",
      "-M",
      "-C",
      "-m",
      "--first-parent",
      "--no-color",
      sha,
    ]);
  }

  /**
   * Read a single blob's RAW BYTES (no UTF-8 decoding). Used for
   * binary-safe rendering paths — image/audio/video data URIs in
   * BlobView, where converting through a string would corrupt
   * non-text bytes.
   *
   * One-shot subprocess per call. Fine for the BlobView path which
   * reads at most one media blob per page render. If you need to
   * pull bytes for many blobs in a row, open a `BlobBatchReader`
   * via `openBatchReader()` and pipeline through it instead.
   *
   * Returns null if the object is missing — symmetric with
   * `BlobBatchReader.read`.
   *
   * @param {string} sha
   * @returns {Promise<Buffer | null>}
   */
  async readBlobBytes(sha) {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["-C", this.#repo, "cat-file", "blob", sha],
        // `encoding: "buffer"` keeps stdout as a Buffer instead of
        // decoding to utf-8 (which would mangle binary). 64 MiB cap
        // matches the text-path #git buffer; callers should size-
        // gate before requesting anyway.
        { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
      );
      return stdout;
    } catch {
      return null;
    }
  }

  /**
   * Open a long-running `git cat-file --batch` reader. Far cheaper than
   * one-shot `git cat-file -p <sha>` per blob: a single fork+startup,
   * then all SHAs are pipelined through stdin/stdout. For a 5k-file
   * repo this is the difference between ~minutes and ~seconds.
   *
   * Caller MUST call `.close()` when done so the subprocess exits.
   *
   * Protocol (from `man git-cat-file`):
   *   - write "<sha>\n" on stdin per request
   *   - read "<sha> <type> <size>\n" header on stdout
   *     OR "<sha> missing\n" for unknown SHAs
   *   - on success: read exactly <size> bytes of content + trailing \n
   *   - reads come back in stdin order, so we just FIFO the queue
   *
   * @returns {BlobBatchReader}
   */
  openBatchReader() {
    return new BlobBatchReader(this.#repo);
  }

  /** @returns {Promise<SourceRef[]>} */
  async listRefs() {
    const stdout = await this.#git([
      "for-each-ref",
      "--format=%(refname)" + FS + "%(objectname)" + FS + "%(HEAD)",
      "refs/heads",
      "refs/tags",
    ]);

    return stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [fullName = "", sha = "", headMarker = ""] = line.split(FS);
        const shortName = fullName.replace(/^refs\/(heads|tags)\//, "");
        /** @type {SourceRef["kind"]} */
        const kind = fullName.startsWith("refs/heads/")
          ? "branch"
          : fullName.startsWith("refs/tags/")
            ? "tag"
            : "other";
        return {
          fullName,
          shortName,
          kind,
          sha,
          isHead: headMarker === "*",
        };
      });
  }
}

/**
 * Streaming reader for `git cat-file --batch`. Holds a single subprocess
 * across many SHA reads. State machine handles the chunk-by-chunk parse
 * — Node's stdout fires `data` events at arbitrary boundaries, so we
 * accumulate into a Buffer and consume header / content in lockstep.
 *
 * Memory note: requests queued while the reader's still warming up are
 * fine because the buffer just grows; a really huge blob (>maxBlobBytes)
 * is the caller's responsibility to skip BEFORE enqueuing the SHA.
 */
export class BlobBatchReader {
  /** @param {string} repo */
  constructor(repo) {
    this.#proc = spawn("git", ["-C", repo, "cat-file", "--batch"]);
    this.#proc.stdout.on("data", (chunk) => this.#onData(chunk));
    this.#proc.stderr.on("data", (chunk) => {
      this.#stderr += chunk.toString("utf8");
    });
    this.#proc.on("close", (code) => {
      this.#closed = true;
      // Anyone still waiting will never get a reply — fail them so a
      // promise doesn't dangle forever.
      const err = new Error(
        `git cat-file --batch closed unexpectedly (exit ${code}): ${this.#stderr.trim()}`,
      );
      for (const q of this.#queue) q.reject(err);
      this.#queue.length = 0;
    });
  }

  /** @type {ReturnType<typeof spawn>} */
  #proc;
  #buffer = Buffer.alloc(0);
  /** @type {{ resolve: (v: Buffer | null) => void, reject: (e: Error) => void }[]} */
  #queue = [];
  /** When non-null, we're mid-read on a content body of this length. */
  #expectedSize = null;
  #stderr = "";
  #closed = false;

  /**
   * Request a blob's bytes. Resolves to null for missing objects.
   * @param {string} sha
   * @returns {Promise<Buffer | null>}
   */
  read(sha) {
    if (this.#closed) {
      return Promise.reject(new Error("BlobBatchReader is closed"));
    }
    return new Promise((resolve, reject) => {
      this.#queue.push({ resolve, reject });
      this.#proc.stdin.write(sha + "\n");
    });
  }

  /** Drain remaining output and shut down the subprocess cleanly. */
  async close() {
    if (this.#closed) return;
    this.#proc.stdin.end();
    await new Promise((resolve) => this.#proc.on("close", resolve));
  }

  /** @param {Buffer} chunk */
  #onData(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    // Parse as much as the buffer currently allows. Each iteration
    // consumes either a header line or a content body+terminator.
    while (this.#tryConsume()) {
      // loop until the parser can't make progress on the current buffer
    }
  }

  /** @returns {boolean} true if we consumed a unit and should try again */
  #tryConsume() {
    if (this.#expectedSize === null) {
      // Awaiting a header line.
      const nl = this.#buffer.indexOf(0x0a);
      if (nl < 0) return false;
      const header = this.#buffer.subarray(0, nl).toString("utf8");
      this.#buffer = this.#buffer.subarray(nl + 1);

      // Two header forms: "<sha> <type> <size>" OR "<sha> missing".
      const parts = header.split(" ");
      if (parts.length === 2 && parts[1] === "missing") {
        const q = this.#queue.shift();
        q?.resolve(null);
        return true;
      }
      if (parts.length === 3) {
        const size = Number(parts[2]);
        if (!Number.isFinite(size) || size < 0) {
          const q = this.#queue.shift();
          q?.reject(new Error(`Bad cat-file header (size unparseable): ${header}`));
          return true;
        }
        this.#expectedSize = size;
        return true;
      }
      // Malformed header — fail the request and try to recover.
      const q = this.#queue.shift();
      q?.reject(new Error(`Bad cat-file header: ${header}`));
      return true;
    }

    // Awaiting <size> bytes + trailing newline.
    const need = this.#expectedSize + 1;
    if (this.#buffer.length < need) return false;
    const body = this.#buffer.subarray(0, this.#expectedSize);
    this.#buffer = this.#buffer.subarray(need); // skip body + LF
    this.#expectedSize = null;
    const q = this.#queue.shift();
    q?.resolve(Buffer.from(body)); // copy out of the rolling buffer
    return true;
  }
}

/**
 * @param {string} record
 * @returns {SourceCommit}
 */
function parseCommitRecord(record) {
  const [
    sha = "",
    parentsRaw = "",
    authorName = "",
    authorEmail = "",
    authorDate = "",
    committerName = "",
    committerEmail = "",
    committerDate = "",
    subject = "",
    body = "",
  ] = record.split(FS);

  const parents = parentsRaw.split(" ").filter(Boolean);

  return {
    sha,
    parent: parents[0] ?? null,
    parents,
    author: { name: authorName, email: authorEmail, date: authorDate },
    committer: {
      name: committerName,
      email: committerEmail,
      date: committerDate,
    },
    subject,
    body: body.trimEnd(),
  };
}
