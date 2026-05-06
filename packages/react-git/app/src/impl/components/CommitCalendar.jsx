/**
 * Contribution calendar — GitHub-style heatmap of commit activity
 * over the past 52 weeks.
 *
 * Server component. Renders an inline SVG with one `<rect>` per day,
 * `<title>` elements as native browser tooltips, and class hooks
 * (`rg-cal-l0` … `rg-cal-l4`) for theme-driven color ramps. Zero
 * client JavaScript — works under static export and in any reading
 * mode.
 *
 * # Why SVG (and not a CSS grid of <div>s)
 *
 * 371 cells of `<div>` would explode the DOM payload more than the
 * underlying data justifies, and SVG `<title>` is the native tooltip
 * channel that doesn't require a JS popover. SVG also gives us
 * subpixel-accurate cell alignment without any flex/grid quirks; the
 * geometry below is the entire layout spec.
 *
 * # Color tiering
 *
 * Five buckets (`rg-cal-l0`…`rg-cal-l4`) chosen to match GitHub's
 * scheme. Tier boundaries are derived from the dataset's max so a
 * quiet repo doesn't render as a uniform monochrome block — a single
 * busy day still gets a top-tier cell relative to the rest.
 *
 * # Color authority
 *
 * The component ships *no* color rules. Each template's stylesheet
 * owns the palette by styling the `.rg-cal-l{0..4}` classes — this
 * is consistent with the rest of the runtime, where impl ships
 * structure and templates ship visual.
 *
 * @param {{ data: import("@level0x40/react-git/source").CommitCalendar }} props
 */
export default function CommitCalendar({ data }) {
  // Geometry — small enough to fit a sidebar, large enough that hover
  // targets are clickable on touch devices. Cell pitch is `cellSize +
  // cellGap`, so 13px = 11px cell + 2px gap.
  const cellSize = 11;
  const cellGap = 2;
  const cellPitch = cellSize + cellGap;
  const weekColumns = data.weeks.length; // always 53
  const dayLabelWidth = 22; // left gutter for "Mon"/"Wed"/"Fri"
  const monthLabelHeight = 14; // top gutter for month names
  const gridWidth = weekColumns * cellPitch - cellGap;
  const gridHeight = 7 * cellPitch - cellGap;
  const svgWidth = dayLabelWidth + gridWidth;
  const svgHeight = monthLabelHeight + gridHeight;

  // Tier boundaries based on max count across the visible window.
  // `maxCount === 0` → every cell is level 0; bucketize() returns 0.
  const max = data.maxCount;
  const t1 = Math.max(1, Math.ceil(max / 4));
  const t2 = Math.max(t1 + 1, Math.ceil(max / 2));
  const t3 = Math.max(t2 + 1, Math.ceil((3 * max) / 4));
  const bucketize = (count) => {
    if (count === 0) return 0;
    if (count <= t1) return 1;
    if (count <= t2) return 2;
    if (count <= t3) return 3;
    return 4;
  };

  // Month labels: emit a label above the first column whose first cell
  // (Sunday) falls in a new month relative to the previous column.
  // Skips labels that would visually collide with the previous one
  // (less than ~3 columns of separation), so January and February
  // labels don't overlap on years with very tight starts.
  /** @type {{ x: number, label: string }[]} */
  const monthLabels = [];
  let lastMonth = -1;
  let lastLabelCol = -10;
  for (let w = 0; w < weekColumns; w++) {
    const sundayDate = data.weeks[w][0].date;
    const month = Number(sundayDate.slice(5, 7));
    if (month !== lastMonth && w - lastLabelCol >= 3) {
      monthLabels.push({
        x: dayLabelWidth + w * cellPitch,
        label: MONTH_NAMES[month - 1],
      });
      lastLabelCol = w;
    }
    lastMonth = month;
  }

  // Date formatter for the per-cell tooltip. Builds strings like
  // "3 commits on Mon, Mar 4, 2026" — explicit weekday + locale-
  // independent so the tooltip reads the same regardless of the
  // user's browser locale (the static export ships everywhere).
  const formatTooltip = (cell) => {
    const d = new Date(`${cell.date}T00:00:00Z`);
    const wday = WEEKDAY_NAMES_LONG[d.getUTCDay()];
    const month = MONTH_NAMES[d.getUTCMonth()];
    const day = d.getUTCDate();
    const year = d.getUTCFullYear();
    if (cell.count === 0) {
      return `No commits on ${wday}, ${month} ${day}, ${year}`;
    }
    const noun = cell.count === 1 ? "commit" : "commits";
    return `${cell.count} ${noun} on ${wday}, ${month} ${day}, ${year}`;
  };

  return (
    <section className="rg-cal" aria-labelledby="rg-cal-title">
      {/* Heading sits alone in the header so it groups visually with
          the grid below. Putting the legend in this header instead
          would force `justify-content: space-between`, which on
          full-width templates leaves an enormous empty band between
          heading and legend — the calendar reads as three disjoint
          fragments. The legend lives in a footer below the grid
          (matching GitHub's layout), where it stays anchored to the
          data it describes regardless of container width. */}
      <header className="rg-cal-header">
        <h2 id="rg-cal-title" className="rg-cal-heading" style={{ margin: 0 }}>
          {data.totalCommits.toLocaleString("en-US")} commits in the last year
        </h2>
      </header>
      <div className="rg-cal-scroll">
        {/* Inline-block wrapper shrink-wraps to the grid's intrinsic
            width (svgWidth, ~709px). The footer below sits inside this
            wrapper, so its `flex-end` alignment lands on the grid's
            right edge — not the section's full width. On full-width
            templates this is the difference between "legend tucked
            against the grid" and "legend stranded at the page edge". */}
        <div
          style={{
            display: "inline-block",
            width: `${svgWidth}px`,
            verticalAlign: "top",
          }}
        >
          <svg
            className="rg-cal-grid"
            width={svgWidth}
            height={svgHeight}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            role="img"
            aria-label={`Commit calendar — ${data.totalCommits} commits between ${data.startDate} and ${data.endDate}`}
          >
            {/* Day-of-week labels in the left gutter. Only Mon/Wed/Fri
              are drawn — labelling all seven crowds the gutter and
              GitHub's calendar uses the same compromise. */}
            {DAY_LABELS.map(({ row, label }) => (
              <text
                key={label}
                className="rg-cal-day-label"
                x={dayLabelWidth - 4}
                y={monthLabelHeight + row * cellPitch + cellSize - 1}
                textAnchor="end"
              >
                {label}
              </text>
            ))}

            {/* Month labels above the first column of each new month. */}
            {monthLabels.map(({ x, label }) => (
              <text
                key={`${x}-${label}`}
                className="rg-cal-month-label"
                x={x}
                y={monthLabelHeight - 4}
              >
                {label}
              </text>
            ))}

            {/* Day cells. Future cells are skipped — drawing them as
              transparent rectangles would still capture pointer events
              and confuse keyboard users on hover. */}
            {data.weeks.flatMap((week, w) =>
              week.map((cell) => {
                if (cell.isFuture) return null;
                const tier = bucketize(cell.count);
                return (
                  <rect
                    key={cell.date}
                    className={`rg-cal-cell rg-cal-l${tier}`}
                    x={dayLabelWidth + w * cellPitch}
                    y={monthLabelHeight + cell.weekday * cellPitch}
                    width={cellSize}
                    height={cellSize}
                    rx={2}
                    ry={2}
                    data-count={cell.count}
                    data-date={cell.date}
                  >
                    <title>{formatTooltip(cell)}</title>
                  </rect>
                );
              }),
            )}
          </svg>
          {/* Legend lives below the grid, right-aligned within the
            grid-width wrapper. `flex-end` pulls it tight against the
            grid's right edge regardless of how wide the surrounding
            page column is. */}
          <footer
            className="rg-cal-footer"
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "0.5rem",
            }}
          >
            <div
              className="rg-cal-legend"
              role="list"
              aria-label="Activity legend"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span className="rg-cal-legend-label" role="listitem">
                Less
              </span>
              {/* Render swatches as one inline SVG so they reuse the same
              `fill`-based color ramp (`.rg-cal-l0..l4`) as the grid
              cells. If we used HTML <span>s with `background-color`,
              every theme would have to ship the ramp twice — once for
              `fill` (grid) and once for `background-color` (legend) —
              and they'd silently drift out of sync. */}
              <svg
                role="listitem"
                aria-hidden="true"
                width={5 * cellSize + 4 * 4}
                height={cellSize}
                style={{ display: "inline-block", verticalAlign: "middle" }}
              >
                {[0, 1, 2, 3, 4].map((tier) => (
                  <rect
                    key={tier}
                    className={`rg-cal-legend-cell rg-cal-l${tier}`}
                    x={tier * (cellSize + 4)}
                    y={0}
                    width={cellSize}
                    height={cellSize}
                    rx={2}
                    ry={2}
                  />
                ))}
              </svg>
              <span className="rg-cal-legend-label" role="listitem">
                More
              </span>
            </div>
          </footer>
        </div>
      </div>
    </section>
  );
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAY_NAMES_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Mon (1), Wed (3), Fri (5). Sun/Tue/Thu/Sat are intentionally
// unlabelled to match GitHub's three-label gutter convention.
const DAY_LABELS = [
  { row: 1, label: "Mon" },
  { row: 3, label: "Wed" },
  { row: 5, label: "Fri" },
];
