const COLORS = ['#5b8cff', '#f5a524', '#3ecf8e', '#c084fc', '#ff8a65', '#22d3ee'] as const;

/** Identification colour of a file, from its position in the file list. */
export function sourceColor(index: number): string {
  return COLORS[index % COLORS.length] ?? '#5b8cff';
}
