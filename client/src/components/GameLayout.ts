export type CellType = "track" | "home" | "finish" | "empty";

export interface LayoutCell {
  row: number;
  col: number;
  type: CellType;
  trackIdx?: number;
  playerId?: string;
}

export const layout: LayoutCell[] = [];

const trackRecords = [
  [11, 5],
  [10, 5],
  [9, 5],
  [8, 5],
  [7, 5],
  [7, 4],
  [7, 3],
  [7, 2],
  [7, 1],
  [6, 1],
  [5, 1],
  [5, 2],
  [5, 3],
  [5, 4],
  [5, 5],
  [4, 5],
  [3, 5],
  [2, 5],
  [1, 5],
  [1, 6],
  [1, 7],
  [2, 7],
  [3, 7],
  [4, 7],
  [5, 7],
  [5, 8],
  [5, 9],
  [5, 10],
  [5, 11],
  [6, 11],
  [7, 11],
  [7, 10],
  [7, 9],
  [7, 8],
  [7, 7],
  [8, 7],
  [9, 7],
  [10, 7],
  [11, 7],
  [11, 6],
];

const playerOrder = ["blue", "yellow", "green", "red"];

trackRecords.forEach(([r, c], idx) => {
  if (idx % 10 == 0) {
    layout.push({
      row: r,
      col: c,
      type: "track",
      trackIdx: idx,
      playerId: playerOrder[idx / 10],
    });
  } else {
    layout.push({ row: r, col: c, type: "track", trackIdx: idx });
  }
});

layout.push(
  ...[
    { row: 1, col: 1, type: "home" as CellType, playerId: "yellow" },
    { row: 1, col: 8, type: "home" as CellType, playerId: "green" },
    { row: 8, col: 1, type: "home" as CellType, playerId: "blue" },
    { row: 8, col: 8, type: "home" as CellType, playerId: "red" },
  ]
);

for (let i = 0; i < 4; i++) {
  layout.push({
    row: 2 + i,
    col: 6,
    type: "finish",
    playerId: "green",
    trackIdx: 40 + i,
  });
}

for (let i = 0; i < 4; i++) {
  layout.push({
    row: 6,
    col: 2 + i,
    type: "finish",
    playerId: "yellow",
    trackIdx: 40 + i,
  });
}

for (let i = 0; i < 4; i++) {
  layout.push({
    row: 6,
    col: 7 + i,
    type: "finish",
    playerId: "red",
    trackIdx: 43 - i,
  });
}

for (let i = 0; i < 4; i++) {
  layout.push({
    row: 7 + i,
    col: 6,
    type: "finish",
    playerId: "blue",
    trackIdx: 43 - i,
  });
}

for (let r = 1; r <= 11; r++) {
  for (let c = 1; c <= 11; c++) {
    if (!layout.find((cell) => cell.row === r && cell.col === c)) {
      layout.push({ row: r, col: c, type: "empty" });
    }
  }
}
