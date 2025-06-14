import React, { use, useCallback, useMemo } from "react";
import { layout, LayoutCell } from "./GameLayout";
import Dice from "./Dice";
import GameSP from "./GameSP";
import Circle from "./Circle";
import { ColorType, Occupant } from "../types";

type Positions = Record<string, number[]>;

interface BoardProps {
  positions: Positions;
  myPlayerId: string;
  onRoll: () => void;
  onMove: (tokenIdx: number) => void;
  rollValue: Record<string, number | null>;
  colorMap: Record<string, ColorType>;
  currentTurn: string;
  loading?: boolean;
}

function Board({
  positions,
  myPlayerId,
  onMove,
  onRoll,
  rollValue,
  colorMap,
  currentTurn,
  loading = false,
}: BoardProps) {
  let playerHome: string | null = null;
  const letters = ["a", "b", "c", "d"];
  const homePos = [
    "items-start justify-start",
    "items-end justify-start",
    "items-start justify-end",
    "items-end justify-end",
  ];

  function getTrackOccupant(trackIdx): Occupant | null {
    for (const [pid, slots] of Object.entries(positions)) {
      const i = slots.findIndex((pos) => pos == trackIdx);
      if (i !== -1) return { playerId: pid, tokenIdx: i, color: colorMap[pid] };
    }
    return null;
  }

  const getHomeTokenFor = useCallback(
    (pcolor: ColorType): Record<number, Occupant | null> | null => {
      const pid = Object.keys(colorMap).find((key) => colorMap[key] == pcolor);
      if (!pid) return null;
      const homeidx: Record<number, Occupant | null> = {};

      positions[pid].forEach((pos, i) => {
        if (pos == -1)
          homeidx[i] = { playerId: pid, tokenIdx: i, color: pcolor };
        else homeidx[i] = null;
      });

      return homeidx;
    },
    [positions]
  );

  const computeDirection = (
    idx: number
  ): ("up" | "down" | "left" | "right")[] => {
    let results: ("up" | "down" | "left" | "right")[] = [];
    for (let nid of [(idx + 1) % 40, (idx + 39) % 40]) {
      if (layout[idx].row > layout[nid].row) {
        results.push("up");
      } else if (layout[idx].row < layout[nid].row) {
        results.push("down");
      } else if (layout[idx].col > layout[nid].col) {
        results.push("left");
      } else if (layout[idx].col < layout[nid].col) {
        results.push("right");
      }
    }
    return results;
  };

  const trackMap = useMemo(() => {
    const m: Record<number, Occupant | null> = {};
    layout.forEach((cell, idx) => {
      if (cell.type === "track" && cell.trackIdx != null) {
        m[cell.trackIdx] = getTrackOccupant(cell.trackIdx);
      }
    });
    return m;
  }, [positions]);

  const getRollValue = useMemo(() => {
    const rolls: Record<string, number | null> = {};
    Object.entries(colorMap).forEach(([pid, color]) => {
      rolls[color] = rollValue[pid];
    });

    return rolls;
  }, [rollValue]);

  const getFinishTrackOccupant = useCallback(
    (
      playerId: "red" | "yellow" | "green" | "blue",
      trackIdx: number
    ): Occupant | null => {
      const pid = Object.keys(colorMap).find(
        (key) => colorMap[key] == playerId
      );
      if (!pid) return null;

      const idx = positions[pid].findIndex((pos) => pos == trackIdx);
      if (idx !== -1) return { playerId: pid, tokenIdx: idx, color: playerId };
      return null;
    },
    [positions]
  );

  const moveToken = (occupant: Occupant) => {
    if (occupant.playerId == myPlayerId) {
      onMove(occupant.tokenIdx);
    }
  };

  return layout.map((cell: LayoutCell, idx) => {
    if (
      cell.type == "home" &&
      (playerHome === null || playerHome != cell.playerId)
    ) {
      console.log("home", cell.playerId, myPlayerId, colorMap[myPlayerId]);

      // -- Home Cell --
      playerHome = cell.playerId as string;

      return (
        <div
          key={idx}
          className={`p-2 flex flex-col space-y-3 ${homePos[idx - 40]}`}
          style={{
            gridRow: `${cell.row} / span 4`,
            gridColumn: `${cell.col} / span 4`,
          }}
        >
          {idx - 40 > 1 ? (
            <>
              <Dice
                loading={colorMap[myPlayerId] == cell.playerId && loading}
                rollDice={onRoll}
                value={getRollValue[cell.playerId as ColorType] ?? null}
                active={
                  colorMap[myPlayerId] == cell.playerId &&
                  currentTurn == myPlayerId
                }
              />
              <GameSP
                onMove={moveToken}
                color={cell.playerId as ColorType}
                active={
                  colorMap[myPlayerId] == cell.playerId &&
                  currentTurn == myPlayerId
                }
                player={getHomeTokenFor(cell.playerId as ColorType)}
              />
            </>
          ) : (
            <>
              <GameSP
                onMove={moveToken}
                color={cell.playerId as ColorType}
                active={
                  colorMap[myPlayerId] == cell.playerId &&
                  currentTurn == myPlayerId
                }
                player={getHomeTokenFor(cell.playerId as ColorType)}
              />
              <Dice
                loading={colorMap[myPlayerId] == cell.playerId && loading}
                rollDice={onRoll}
                value={getRollValue[cell.playerId as ColorType] ?? null}
                active={
                  colorMap[myPlayerId] == cell.playerId &&
                  currentTurn == myPlayerId
                }
              />
            </>
          )}
        </div>
      );
    } else if (cell.type == "track") {
      let directions = computeDirection(idx);

      return (
        <div
          key={idx}
          className="relative flex justify-center items-center"
          style={{ gridRow: cell.row, gridColumn: cell.col }}
        >
          {directions.map((direction, i) => (
            <div className={`bar bar-${direction}`}></div>
          ))}
          {idx % 10 == 0 ? (
            <Circle
              filled
              onMove={moveToken}
              letter="A"
              pwn={trackMap[idx]}
              color={cell.playerId as ColorType}
            />
          ) : (
            <Circle onMove={moveToken} pwn={trackMap[idx]} />
          )}
        </div>
      );
    } else if (cell.type == "finish") {
      const occ = getFinishTrackOccupant(
        cell.playerId as ColorType,
        cell.trackIdx ?? 0
      );
      return (
        <div
          key={idx}
          className="relative flex justify-center items-center"
          style={{ gridRow: cell.row, gridColumn: cell.col }}
        >
          <Circle
            onMove={moveToken}
            color={cell.playerId as ColorType}
            filled
            pwn={occ}
            letter={letters[(cell.trackIdx ?? 0) - 40]}
          />
        </div>
      );
    } else return <></>;
  });
}

export default Board;
