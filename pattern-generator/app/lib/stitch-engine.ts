import { STITCH_LIBRARY, type StitchRecipe, type Terminology } from "./stitch-library";

export type EngineStitch = StitchRecipe["name"];
export type PatternRow = {
  rowNumber: number;
  instruction: string;
  stitchCount: number;
  countLabel: string;
};

export type Blueprint = {
  startingChain: number;
  totalRows: number;
  workingStitches: number;
};

const recipeFor = (name: EngineStitch) => STITCH_LIBRARY.find((r) => r.name === name)!;

const terms = (terminology: Terminology) => ({
  dc: terminology === "UK" ? "dc" : "sc",
  hdc: terminology === "UK" ? "htr" : "hdc",
  tr: terminology === "UK" ? "tr" : "dc",
  miss: terminology === "UK" ? "miss" : "skip",
});

export function startingChainFor(targetStitches: number, stitch: EngineStitch) {
  const rule = recipeFor(stitch).foundation;
  return Math.ceil(Math.max(1, targetStitches - rule.add) / rule.multiple) * rule.multiple + rule.add;
}

export function blueprintFor(
  width: number,
  length: number,
  stitchGauge: number,
  rowGauge: number,
  style: EngineStitch,
): Blueprint {
  const target = Math.max(4, Math.round(width * stitchGauge / 4));
  const totalRows = Math.max(1, Math.round(length * rowGauge / 4));
  const startingChain = startingChainFor(target, style);

  let workingStitches = startingChain - 1;
  if (style === "Moss / Linen") workingStitches = Math.floor((startingChain - 1) / 2);
  if (style === "Block Stitch") workingStitches = startingChain / 2;
  if (style === "V-Stitch") {
    const v = Math.floor((startingChain - 4) / 3);
    workingStitches = v * 2 + 1;
  }
  if (style === "Waffle Stitch") workingStitches = startingChain - 2;

  return { startingChain, totalRows, workingStitches };
}

function colourName(row: number) {
  return "Colour " + (((row - 1) % 4) + 1);
}

function push(
  rows: PatternRow[],
  rowNumber: number,
  instruction: string,
  stitchCount: number,
  countLabel: string,
) {
  rows.push({ rowNumber, instruction, stitchCount, countLabel });
}

export function buildRows(
  style: EngineStitch,
  terminology: Terminology,
  chain: number,
  totalRows: number,
): PatternRow[] {
  const { dc, hdc, tr, miss } = terms(terminology);
  const rows: PatternRow[] = [];

  for (let r = 1; r <= totalRows; r++) {
    const colour = colourName(r);

    if (style === "Plain") {
      const count = chain - 1;
      if (r === 1) {
        push(rows, r,
          `With ${colour}, ch ${chain}. Work 1 ${dc} in the 2nd ch from hook, then work 1 ${dc} in each chain across. Turn your work.`,
          count, `${count} ${dc} stitches`);
      } else {
        push(rows, r,
          `Ch 1 (does not count as a stitch). Work 1 ${dc} in the first stitch, then work 1 ${dc} in each stitch across to the end. Turn your work.`,
          count, `${count} ${dc} stitches`);
      }
      continue;
    }

    if (style === "Moss / Linen") {
      // Canonical Dora Does construction: odd foundation, ch2 counts as dc + ch1.
      const dcCount = Math.floor((chain - 1) / 2);
      const spaces = dcCount;
      if (r === 1) {
        push(rows, r,
          `With ${colour}, ch ${chain}. Ch 2 (counts as 1 ${dc} and ch 1). ${miss} the stitch at the base of the ch-2 and the next stitch, then work 1 ${dc} in the next stitch. After each ${dc}, ch 1, ${miss} 1 stitch, then work 1 ${dc} in the next stitch. Repeat this sequence across. Turn your work.`,
          dcCount, `${dcCount} ${dc} stitches + ${spaces} ch-1 spaces`);
      } else {
        push(rows, r,
          `Ch 2 (counts as 1 ${dc} and ch 1). Work 1 ${dc} in the first ch-1 space. After each ${dc}, ch 1, ${miss} 1 ${dc}, then work 1 ${dc} in the next ch-1 space. Repeat this sequence across. Work the final ${dc} into the ch-2 turning chain from the previous row. Turn your work.`,
          dcCount + 1, `${dcCount + 1} ${dc} stitches + ${spaces} ch-1 spaces`);
      }
      continue;
    }

    if (style === "Lemon Peel") {
      const count = chain - 1;
      const first = r === 1;
      if (first) {
        push(rows, r,
          `With ${colour}, ch ${chain}. Work 1 ${dc} in the 2nd ch from hook, then 1 ${tr} in the next chain. Continue across by alternating 1 ${dc}, then 1 ${tr}, working the opposite stitch into each successive chain. Turn your work.`,
          count, `${count} alternating ${dc}/${tr} stitches`);
      } else {
        push(rows, r,
          `Ch 1 (does not count as a stitch). Work 1 ${tr} in the first ${dc} below, then 1 ${dc} in the next ${tr} below. Continue across by alternating 1 ${tr}, then 1 ${dc}, working the opposite stitch into each successive stitch below. Turn your work.`,
          count, `${count} stitches`);
      }
      continue;
    }

    if (style === "Granny Stripe") {
      const k = (chain - 2) / 3;
      const row1 = chain - 1;
      if (r === 1) {
        push(rows, r,
          `With ${colour}, ch ${chain}. Work 1 ${dc} in the 2nd ch from hook, then work 1 ${dc} in each chain across. Turn your work.`,
          row1, `${row1} ${dc} stitches`);
      } else if (r === 2) {
        push(rows, r,
          `Change to ${colour}. Ch 3 (counts as 1 ${tr}). Work 1 ${tr} in the same stitch as the ch-3. ${miss} 2 stitches, then work 3 ${tr} in the next stitch. Repeat this sequence across. After the final 3-${tr} cluster, ${miss} 2 stitches, then work 2 ${tr} in the last stitch. Turn your work.`,
          row1, `${row1} ${tr} stitches`);
      } else if (r % 2 === 1) {
        // Bella Coco Rows 3+: the number of actual tr stitches changes because the
        // clusters are worked into spaces rather than individual foundation stitches.
        const clusters = Math.max(1, k - 1);
        const count = clusters * 3 + 2;
        push(rows, r,
          `Change to ${colour}. Ch 3 (counts as 1 ${tr}). ${miss} the next stitch, then work 3 ${tr} in the first space between clusters from the previous row. After each 3-${tr} cluster, ${miss} 3 stitches, then work 3 ${tr} in the next space between clusters. Repeat across. Finish with 1 ${tr} in the top of the previous ch-3. Turn your work.`,
          count, `${clusters} 3-${tr} clusters + 2 edge ${tr}`);
      } else {
        const clusters = Math.max(1, k - 1);
        const count = clusters * 3 + 2;
        push(rows, r,
          `Change to ${colour}. Ch 3 (counts as 1 ${tr}). Work 1 ${tr} in the first space between the first and second stitches of the previous row. After each 3-${tr} cluster, ${miss} 3 stitches, then work 3 ${tr} in the next space between clusters. Repeat across. Finish with 1 ${tr} in the final edge space, then work 1 ${tr} in the top of the previous ch-3. Turn your work.`,
          count, `${clusters} 3-${tr} clusters + 2 edge ${tr}`);
      }
      continue;
    }

    if (style === "Block Stitch") {
      const row1Count = chain / 2;
      const spaces = row1Count - 1;
      if (r === 1) {
        push(rows, r,
          `With ${colour}, ch ${chain}. Work 1 ${hdc} in the 2nd ch from hook. After each ${hdc}, ch 1, ${miss} 1 chain, then work 1 ${hdc} in the next chain. Repeat this sequence across to the end. Turn your work.`,
          row1Count, `${row1Count} ${hdc} stitches + ${spaces} ch-1 spaces`);
      } else if (r % 2 === 0) {
        const count = spaces * 3 + 2;
        push(rows, r,
          `Change to ${colour}. Ch 3 (counts as 1 ${tr}). Work 3 ${tr} in the first ch-1 space. After each 3-${tr} group, work 3 ${tr} in the next ch-1 space. Repeat across. Finish with 1 ${tr} in the final stitch. Turn your work.`,
          count, `${count} ${tr} stitches`);
      } else {
        push(rows, r,
          `Change to ${colour}. Ch 1 (does not count as a stitch). Work 1 ${hdc} in the first stitch. After each group of three ${tr}, ch 1, then work 1 ${hdc} in the space between the next groups. Repeat across. Finish with ch 1 and 1 ${hdc} in the last stitch. Turn your work.`,
          row1Count, `${row1Count} ${hdc} stitches + ${spaces} ch-1 spaces`);
      }
      continue;
    }

    if (style === "V-Stitch") {
      const v = Math.floor((chain - 4) / 3);
      const row1Tr = v * 2 + 1;
      const laterTr = v * 2 + 2;
      if (r === 1) {
        push(rows, r,
          `With ${colour}, ch ${chain}. Work (1 ${tr}, ch 1, 1 ${tr}) in the 5th ch from hook to make the first V-stitch. After each V-stitch, ${miss} 2 chains, then work (1 ${tr}, ch 1, 1 ${tr}) in the next chain to make the next V-stitch. Repeat until you have made ${v} V-stitches in total. After the final V-stitch, ${miss} 1 chain, then work 1 ${tr} in the final chain. Turn your work.`,
          row1Tr, `${v} V-stitches + 1 edge ${tr} = ${row1Tr} ${tr} stitches + ${v} ch-1 spaces`);
      } else {
        push(rows, r,
          `Change to ${colour}. Ch 3 (counts as 1 ${tr}). Work 1 ${tr} in the first edge stitch, then work (1 ${tr}, ch 1, 1 ${tr}) in the ch-1 space of every V-stitch across. Finish with 1 ${tr} in the top of the previous turning chain. Turn your work.`,
          laterTr, `${laterTr} ${tr} stitches + ${v} ch-1 spaces (${v} V-stitches)`);
      }
      continue;
    }

    if (style === "Shell Stitch") {
      const shells = (chain - 2) / 6;
      const row1Count = chain - 1;
      if (r === 1) {
        push(rows, r,
          `With ${colour}, ch ${chain}. Work 1 ${dc} in the 2nd ch from hook. ${miss} 2 chains, then work 5 ${tr} in the next chain. After each 5-${tr} shell, ${miss} 2 chains, then work 1 ${dc} in the next chain. Repeat this shell-and-anchor sequence across. Turn your work.`,
          row1Count, `${shells + 1} ${dc} stitches + ${shells} shells (5 ${tr} each)`);
      } else if (r % 2 === 0) {
        const count = shells * 6;
        push(rows, r,
          `Change to ${colour}. Ch 1 (does not count as a stitch). Work 3 ${tr} in the first stitch. ${miss} 2 stitches, then work 1 ${dc} in the middle ${tr} of the next shell. ${miss} 2 stitches, then work 5 ${tr} in the next ${dc}. Repeat this sequence across. Finish with 3 ${tr} in the last ${dc}. Turn your work.`,
          count, `${count} working stitches: ${shells} shell-row units with 3-tr edge halves`);
      } else {
        push(rows, r,
          `Change to ${colour}. Ch 1 (does not count as a stitch). Work 1 ${dc} in the first stitch. Work 5 ${tr} in the next ${dc}, then ${miss} 2 stitches and work 1 ${dc} in the middle ${tr} of the next shell. Repeat this shell-and-anchor sequence across. After the final anchor, ${miss} 2 stitches, then finish with 1 ${dc} in the final stitch. Turn your work.`,
          row1Count, `${shells + 1} ${dc} anchors + ${shells} shells`);
      }
      continue;
    }

    if (style === "Waffle Stitch") {
      const count = chain - 2;
      const repeats = (count - 2) / 3;
      const fp = terminology === "UK" ? "front post treble (fptr)" : "front post double crochet (fpdc)";
      if (r === 1) {
        push(rows, r,
          `With ${colour}, ch ${chain}. The first 3 chains count as 1 ${tr}. Work 1 ${tr} in the 4th ch from hook, then work 1 ${tr} in each remaining chain across. Turn your work.`,
          count, `${count} ${tr} stitches`);
      } else if (r % 2 === 0) {
        push(rows, r,
          `Change to ${colour}. Ch 3 (counts as 1 ${tr}). Work 1 ${fp} around each of the next 2 stitches, then work 1 ${tr} in the next stitch. Repeat this 2-${fp}-then-${tr} sequence across. Finish with 1 ${tr} in the top of the previous ch-3. Turn your work.`,
          count, `${count} stitches`);
      } else {
        push(rows, r,
          `Change to ${colour}. Ch 3 (counts as 1 ${tr}). Work 1 ${fp} around the next stitch, then work 1 ${tr} in each of the next 2 stitches. Repeat this ${fp}-then-2-${tr} sequence across. Finish with 1 ${tr} in the top of the previous ch-3. Turn your work.`,
          count, `${count} stitches`);
      }
      continue;
    }
  }

  return rows;
}

export type PreviewRow = { rowNumber: number; label: string; text: string; stitchCount: number; countLabel: string };

export function buildPreviewRows(
  chain: number,
  style: EngineStitch,
  terminology: Terminology,
): PreviewRow[] {
  const rows = buildRows(style, terminology, chain, 3);
  return rows.map((row) => ({
    rowNumber: row.rowNumber,
    label: "Row " + row.rowNumber,
    text: row.instruction + " (" + row.countLabel + ").",
    stitchCount: row.stitchCount,
    countLabel: row.countLabel,
  }));
}

// These are deliberately small executable invariants. They catch the exact class
// of bug that previously let the UI say one count while the instruction described another.
export function validateStitchEngine() {
  const cases: Array<[EngineStitch, number, number[]]> = [
    ["Plain", 65, [64, 64, 64]],
    ["Lemon Peel", 65, [64, 64, 64]],
    ["Moss / Linen", 65, [32, 33, 33]],
    ["Granny Stripe", 65, [64, 64, 62]],
    ["Block Stitch", 64, [32, 95, 32]],
    ["V-Stitch", 64, [41, 42, 42]],
    ["Shell Stitch", 68, [67, 66, 67]],
    ["Waffle Stitch", 61, [59, 59, 59]],
  ];

  for (const [style, chain, expected] of cases) {
    const actual = buildRows(style, "UK", chain, 3).map((row) => row.stitchCount);
    if (actual.some((count, index) => count !== expected[index])) {
      throw new Error(
        "Invalid " + style + " recipe for chain " + chain +
        ": expected " + expected.join(",") + " but got " + actual.join(","),
      );
    }
  }
}

validateStitchEngine();
