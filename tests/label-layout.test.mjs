import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const layout = require("../src/label-layout.js");
const DENSE_CLUSTER_MAX_OVERLAP = 5000;
const SMALL_CARD_MAX_DISTANCE = 67;

test("label layout module exposes the global planner", () => {
  assert.equal(typeof layout.planLabelLayout, "function");
});

function makeField(width, height, cellSize, paint, options = {}) {
  const columns = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const landMask = new Uint8Array(columns * rows);
  const coastMask = new Uint8Array(columns * rows);
  paint({ columns, rows, landMask, coastMask });
  return layout.createAvoidanceField({
    width,
    height,
    cellSize,
    landMask,
    coastMask,
    coastGeometryMask: options.coastGeometryMask ?? coastMask,
    mapWorldWidth: options.mapWorldWidth ?? width,
    coastGeometryRadius: options.coastGeometryRadius ?? 0
  });
}

function boxGap(a, b) {
  const x = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
  const y = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
  return Math.hypot(x, y);
}

function boxesOverlap(a, b) {
  return Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
    Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
}

function totalOverlapArea(entries) {
  let total = 0;
  for (let index = 0; index < entries.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < entries.length; otherIndex += 1) {
      const first = entries[index].box;
      const second = entries[otherIndex].box;
      total += Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left)) *
        Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
    }
  }
  return total;
}

function assertNoOverlaps(entries) {
  for (let first = 0; first < entries.length; first += 1) {
    for (let second = first + 1; second < entries.length; second += 1) {
      assert.equal(
        boxesOverlap(entries[first].box, entries[second].box),
        false,
        `${entries[first].id} overlaps ${entries[second].id}`
      );
    }
  }
}

function labelsForMarkers(markers, sizeForMarker) {
  return markers.map((marker, index) => {
    const size = typeof sizeForMarker === "function"
      ? sizeForMarker(marker, index)
      : sizeForMarker;
    return {
      id: marker.id,
      markerId: marker.id,
      width: size.width,
      height: size.height
    };
  });
}

function isStandardPlacement(result, marker, width, height) {
  const horizontal = Math.abs(result.centerX - marker.x);
  const vertical = Math.abs(result.centerY - marker.y);
  return horizontal < 0.01 ||
    vertical < 0.01 ||
    Math.abs((horizontal - width / 2) - (vertical - height / 2)) < 0.01;
}

test("avoidance field reports land and coastline coverage with integral queries", () => {
  const field = makeField(120, 80, 10, ({ columns, rows, landMask, coastMask }) => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (column < 6) {
          landMask[row * columns + column] = 255;
        }
        if (column === 5 || column === 6) {
          coastMask[row * columns + column] = 255;
        }
      }
    }
  });

  assert.deepEqual(field.query({ left: 0, top: 0, right: 40, bottom: 40 }), {
    land: 1,
    coast: 0
  });
  assert.equal(field.query({ left: 50, top: 0, right: 70, bottom: 40 }).coast, 1);
  assert.equal(field.query({ left: 80, top: 0, right: 120, bottom: 40 }).land, 0);
});

test("avoidance field measures marker distance to the nearest coastline", () => {
  const field = makeField(240, 160, 4, ({ columns, rows, coastMask }) => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (column === 25) {
          coastMask[row * columns + column] = 255;
        }
      }
    }
  });

  assert.equal(field.coastDistance({ x: 102, y: 80 }, 40), 0);
  assert.equal(field.coastDistance({ x: 116, y: 80 }, 40), 12);
  assert.equal(field.coastDistance({ x: 180, y: 80 }, 40), Infinity);
});

test("coastline identity applies only while the city marker is very close", () => {
  assert.equal(layout.coastlineIdentityWeight(0), 1);
  assert.equal(layout.coastlineIdentityWeight(3), 1);
  assert.equal(layout.coastlineIdentityWeight(8) > 0, true);
  assert.equal(layout.coastlineIdentityWeight(12), 0);
  assert.equal(layout.coastlineIdentityWeight(80), 0);
});

test("global planner is deterministic and independent from input order", () => {
  const labels = [
    { id: "alpha", markerId: "alpha", width: 74, height: 36 },
    { id: "beta", markerId: "beta", width: 82, height: 36 },
    { id: "gamma", markerId: "gamma", width: 78, height: 36 }
  ];
  const markers = [
    { id: "alpha", x: 180, y: 120 },
    { id: "beta", x: 218, y: 122 },
    { id: "gamma", x: 199, y: 158 }
  ];
  const options = {
    labels,
    markers,
    viewport: { x: 0, y: 0, width: 420, height: 260 },
    seed: "stable-layout"
  };
  const first = layout.planLabelLayout(options);
  const second = layout.planLabelLayout({
    ...options,
    labels: labels.slice().reverse(),
    markers: markers.slice().reverse()
  });

  assert.deepEqual(first, second);
  assert.deepEqual(first.map((entry) => entry.id), ["alpha", "beta", "gamma"]);
});

test("planner keeps every card inside the viewport and within its maximum displacement", () => {
  const labels = [
    { id: "northwest", markerId: "northwest", width: 180, height: 48 },
    { id: "southeast", markerId: "southeast", width: 140, height: 64 }
  ];
  const markers = [
    { id: "northwest", x: 8, y: 9 },
    { id: "southeast", x: 312, y: 191 }
  ];
  const result = layout.planLabelLayout({
    labels,
    markers,
    viewport: { x: 0, y: 0, width: 320, height: 200 },
    seed: "edge-cases"
  });

  assert.equal(result.length, labels.length);
  for (const entry of result) {
    const marker = markers.find((candidate) => candidate.id === entry.id);
    const label = labels.find((candidate) => candidate.id === entry.id);
    const maximum = Math.min(140, Math.max(72, label.height * 1.6));
    assert.equal(entry.box.left >= 4, true, entry.id);
    assert.equal(entry.box.right <= 316, true, entry.id);
    assert.equal(entry.box.top >= 4, true, entry.id);
    assert.equal(entry.box.bottom <= 196, true, entry.id);
    assert.equal(layout.distancePointToBox(marker, entry.box) <= maximum + 0.001, true, entry.id);
  }
});

test("coastline avoidance is stronger than land avoidance", () => {
  const field = makeField(360, 220, 10, ({ columns, rows, landMask, coastMask }) => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        if (column < 17) {
          landMask[index] = 255;
        }
        if (column >= 18 && column <= 28) {
          coastMask[index] = 255;
        }
      }
    }
  });
  const [entry] = layout.planLabelLayout({
    labels: [{ id: "city", markerId: "city", width: 100, height: 42 }],
    markers: [{ id: "city", x: 180, y: 110 }],
    viewport: { x: 0, y: 0, width: 360, height: 220 },
    avoidanceField: field,
    seed: "coast-priority"
  });

  assert.equal(entry.centerX < 180, true);
  assert.equal(field.query(entry.box).coast, 0);
  assert.equal(field.query(entry.box).land > 0, true);
});

test("an inland city ignores a distant coastline and stays close to its marker", () => {
  const width = 400;
  const height = 300;
  const marker = { id: "city", x: 200, y: 150 };
  const avoidanceField = makeField(width, height, 4, ({
    columns,
    rows,
    coastMask
  }) => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = column * 4;
        if (x >= 270 && x < 278) {
          coastMask[row * columns + column] = 255;
        }
      }
    }
  });
  const result = layout.planLabelLayout({
    labels: [{ id: "city", markerId: "city", width: 120, height: 50 }],
    markers: [marker],
    viewport: { x: 0, y: 0, width, height },
    avoidanceField,
    seed: "inland-distant-coast",
    options: { candidateGaps: [8], starts: 1, annealSteps: 0 }
  })[0];

  assert.equal(result.centerX > marker.x, true);
  assert.equal(layout.distancePointToBox(marker, result.box) <= 10, true);
  assert.equal(result.connector, null);
});

test("a coastal city avoids covering the nearby coastline shape", () => {
  const width = 400;
  const height = 300;
  const marker = { id: "city", x: 200, y: 150 };
  const avoidanceField = makeField(width, height, 4, ({
    columns,
    rows,
    coastMask
  }) => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const y = row * 4;
        if (y >= 148 && y < 156) {
          coastMask[row * columns + column] = 255;
        }
      }
    }
  });
  const result = layout.planLabelLayout({
    labels: [{ id: "city", markerId: "city", width: 120, height: 50 }],
    markers: [marker],
    viewport: { x: 0, y: 0, width, height },
    avoidanceField,
    seed: "coastal-identity",
    options: { candidateGaps: [8], starts: 1, annealSteps: 0 }
  })[0];

  assert.equal(Math.abs(result.centerY - marker.y) > Math.abs(result.centerX - marker.x), true);
  assert.equal(layout.distancePointToBox(marker, result.box) <= 10, true);
  assert.equal(avoidanceField.query(result.box).coast, 0);
});

test("a nearby northeast-southwest coast narrows placement to the northwest-southeast axis", () => {
  const width = 400;
  const height = 300;
  const cellSize = 4;
  const marker = { id: "sydney", x: 200, y: 150 };
  const avoidanceField = makeField(width, height, cellSize, ({
    columns,
    rows,
    landMask,
    coastMask
  }) => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = column * cellSize + cellSize / 2;
        const y = row * cellSize + cellSize / 2;
        const diagonal = x + y;
        const index = row * columns + column;
        if (diagonal < 350) {
          landMask[index] = 255;
        }
        if (Math.abs(diagonal - 350) <= 4) {
          coastMask[index] = 255;
        }
      }
    }
  });
  const result = layout.planLabelLayout({
    labels: [{ id: "sydney", markerId: "sydney", width: 132, height: 60 }],
    markers: [marker],
    viewport: { x: 0, y: 0, width, height },
    avoidanceField,
    seed: "sydney-local-coast",
    options: { starts: 1, annealSteps: 0 }
  })[0];
  const offsetX = result.centerX - marker.x;
  const offsetY = result.centerY - marker.y;

  assert.equal(offsetX > 0, true);
  assert.equal(offsetY > 0, true);
  assert.equal(Math.min(offsetX, offsetY) > 20, true);
});

test("coastal classification follows map scale around the Johannesburg reference", () => {
  function placeAtCoastRatio(mapWorldWidth, coastRatio) {
    const width = 400;
    const height = 300;
    const cellSize = 2;
    const marker = { id: "city", x: 200, y: 150 };
    const coastY = marker.y + mapWorldWidth * coastRatio;
    const avoidanceField = makeField(width, height, cellSize, ({
      columns,
      rows,
      coastMask
    }) => {
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const y = row * cellSize + cellSize / 2;
          if (Math.abs(y - coastY) <= cellSize / 2) {
            coastMask[row * columns + column] = 255;
          }
        }
      }
    }, { mapWorldWidth });
    return layout.planLabelLayout({
      labels: [{ id: "city", markerId: "city", width: 120, height: 50 }],
      markers: [marker],
      viewport: { x: 0, y: 0, width, height },
      avoidanceField,
      seed: `coast-scale-${mapWorldWidth}-${coastRatio}`,
      options: { candidateGaps: [12], starts: 1, annealSteps: 0 }
    })[0];
  }

  const inlandSmall = placeAtCoastRatio(500, 0.013);
  const inlandLarge = placeAtCoastRatio(1000, 0.013);
  const coastalSmall = placeAtCoastRatio(1000, 0.008);
  const coastalLarge = placeAtCoastRatio(2000, 0.008);

  assert.equal(inlandSmall.centerX > 200 && Math.abs(inlandSmall.centerY - 150) < 0.01, true);
  assert.equal(inlandLarge.centerX > 200 && Math.abs(inlandLarge.centerY - 150) < 0.01, true);
  assert.equal(Math.abs(coastalSmall.centerY - 150) > 20, true);
  assert.equal(Math.abs(coastalLarge.centerY - 150) > 20, true);
});

test("a branched local coast lets the better regular corner outrank its dominant axis", () => {
  const width = 400;
  const height = 300;
  const cellSize = 4;
  const marker = { id: "nagoya", x: 200, y: 150 };
  const avoidanceField = makeField(width, height, cellSize, ({
    columns,
    rows,
    landMask,
    coastMask
  }) => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = column * cellSize + cellSize / 2;
        const y = row * cellSize + cellSize / 2;
        const index = row * columns + column;
        if (y < marker.y || x < 225) {
          landMask[index] = 255;
        }
        if (
          Math.abs(y - marker.y) <= 4 ||
          (Math.abs(x - marker.x) <= 4 && Math.abs(y - marker.y) <= 20)
        ) {
          coastMask[index] = 255;
        }
      }
    }
  }, { mapWorldWidth: 1000 });
  const result = layout.planLabelLayout({
    labels: [{ id: "nagoya", markerId: "nagoya", width: 120, height: 50 }],
    markers: [marker],
    viewport: { x: 0, y: 0, width, height },
    avoidanceField,
    seed: "branched-coast-regular-corner",
    options: { candidateGaps: [12], starts: 1, annealSteps: 0 }
  })[0];

  assert.equal(result.centerX > marker.x, true);
  assert.equal(result.centerY > marker.y, true);
  assert.equal(isStandardPlacement(result, marker, 120, 50), true);
});

test("weak land coverage remains a stable aesthetic preference for inland cities", () => {
  const width = 400;
  const height = 300;
  const marker = { id: "city", x: 200, y: 150 };
  const avoidanceField = makeField(width, height, 4, ({
    columns,
    rows,
    landMask
  }) => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (column * 4 >= marker.x) {
          landMask[row * columns + column] = 255;
        }
      }
    }
  });
  const result = layout.planLabelLayout({
    labels: [{ id: "city", markerId: "city", width: 120, height: 50 }],
    markers: [marker],
    viewport: { x: 0, y: 0, width, height },
    avoidanceField,
    seed: "weak-land-preference",
    options: { candidateGaps: [8], starts: 1, annealSteps: 0 }
  })[0];

  assert.equal(result.centerX < marker.x, true);
  assert.equal(layout.distancePointToBox(marker, result.box) <= 10, true);
});

test("minor land coverage does not override the regular nearby direction", () => {
  const width = 400;
  const height = 300;
  const cellSize = 4;
  const marker = { id: "city", x: 200, y: 150 };
  const avoidanceField = makeField(width, height, cellSize, ({
    columns,
    rows,
    landMask
  }) => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = column * cellSize;
        if (x >= 212 && x < 240) {
          landMask[row * columns + column] = 255;
        }
      }
    }
  });
  const result = layout.planLabelLayout({
    labels: [{ id: "city", markerId: "city", width: 120, height: 50 }],
    markers: [marker],
    viewport: { x: 0, y: 0, width, height },
    avoidanceField,
    seed: "minor-land-coverage",
    options: { candidateGaps: [12], starts: 1, annealSteps: 0 }
  })[0];

  assert.equal(Math.abs(result.centerX - marker.x) > 20, true);
  assert.equal(Math.abs(result.centerY - marker.y) < 0.01, true);
  assert.equal(isStandardPlacement(result, marker, 120, 50), true);
});

test("a label does not repel itself away from its own marker", () => {
  const marker = { id: "city", x: 200, y: 150 };
  const result = layout.planLabelLayout({
    labels: [{ id: "city", markerId: "city", width: 120, height: 50 }],
    markers: [marker],
    viewport: { x: 0, y: 0, width: 400, height: 300 },
    seed: "own-marker-belongs",
    options: { starts: 1, annealSteps: 0 }
  })[0];

  assert.equal(layout.distancePointToBox(marker, result.box) >= 12, true);
  assert.equal(layout.distancePointToBox(marker, result.box) <= 14, true);
});

test("regular direction preference is horizontal then diagonal then down then up", () => {
  const marker = { id: "city", x: 200, y: 150 };
  const label = { id: "city", markerId: "city", width: 120, height: 50 };
  const baseOptions = {
    candidateGaps: [12],
    starts: 1,
    annealSteps: 0,
    weights: { markerNear: 0 }
  };
  const horizontal = layout.planLabelLayout({
    labels: [label],
    markers: [marker],
    viewport: { x: 0, y: 0, width: 400, height: 300 },
    seed: "direction-horizontal",
    options: baseOptions
  })[0];
  const oppositeHorizontal = layout.planLabelLayout({
    labels: [label],
    markers: [
      marker,
      { id: "right", x: 272, y: 150 }
    ],
    viewport: { x: 0, y: 0, width: 400, height: 300 },
    seed: "direction-opposite-horizontal",
    options: baseOptions
  })[0];
  const diagonal = layout.planLabelLayout({
    labels: [label],
    markers: [
      marker,
      { id: "right", x: 272, y: 150 },
      { id: "left", x: 128, y: 150 }
    ],
    viewport: { x: 0, y: 0, width: 400, height: 300 },
    seed: "direction-diagonal",
    options: baseOptions
  })[0];
  const down = layout.planLabelLayout({
    labels: [label],
    markers: [
      marker,
      { id: "right", x: 272, y: 150 },
      { id: "left", x: 128, y: 150 },
      { id: "northeast", x: 268.5, y: 116.5 },
      { id: "southeast", x: 268.5, y: 183.5 },
      { id: "northwest", x: 131.5, y: 116.5 },
      { id: "southwest", x: 131.5, y: 183.5 }
    ],
    viewport: { x: 0, y: 0, width: 400, height: 300 },
    seed: "direction-down",
    options: baseOptions
  })[0];

  assert.equal(Math.abs(horizontal.centerY - marker.y) < 0.01, true);
  assert.equal(oppositeHorizontal.centerX < marker.x, true);
  assert.equal(Math.abs(oppositeHorizontal.centerY - marker.y) < 0.01, true);
  assert.equal(Math.abs(diagonal.centerX - marker.x) > 20, true);
  assert.equal(Math.abs(diagonal.centerY - marker.y) > 20, true);
  assert.equal(Math.abs(down.centerX - marker.x) < 0.01, true);
  assert.equal(down.centerY > marker.y, true);
});

test("nearby foreign markers strongly repel a label before they can look associated", () => {
  const marker = { id: "city", x: 200, y: 150 };
  const result = layout.planLabelLayout({
    labels: [{ id: "city", markerId: "city", width: 120, height: 50 }],
    markers: [
      marker,
      { id: "foreign", x: 350, y: 150 }
    ],
    viewport: { x: 0, y: 0, width: 400, height: 300 },
    seed: "foreign-marker-clearance",
    options: { candidateGaps: [16], starts: 1, annealSteps: 0 }
  })[0];

  assert.equal(layout.distancePointToBox(marker, result.box) <= 18, true);
  assert.equal(
    layout.distancePointToBox({ x: 350, y: 150 }, result.box) >= 24,
    true
  );
});

test("label spacing uses a wider horizontal halo and scales with card size", () => {
  const small = layout.labelSpacingRadii(
    { left: 0, top: 0, right: 100, bottom: 40 },
    { left: 140, top: 0, right: 240, bottom: 40 },
    32
  );
  const large = layout.labelSpacingRadii(
    { left: 0, top: 0, right: 200, bottom: 80 },
    { left: 240, top: 0, right: 440, bottom: 80 },
    32
  );

  assert.equal(Math.abs(small.horizontal / small.vertical - 1.5) < 0.001, true);
  assert.equal(large.horizontal > small.horizontal, true);
  assert.equal(large.vertical > small.vertical, true);
});

test("open diagonal placements align to the card rectangle rather than a fixed angle", () => {
  const marker = { id: "city", x: 200, y: 150 };
  const result = layout.planLabelLayout({
    labels: [{ id: "city", markerId: "city", width: 120, height: 50 }],
    markers: [
      marker,
      { id: "north-blocker", x: 200, y: 105 },
      { id: "south-blocker", x: 200, y: 195 },
      { id: "east-blocker", x: 245, y: 150 },
      { id: "west-blocker", x: 155, y: 150 }
    ],
    viewport: { x: 0, y: 0, width: 400, height: 300 },
    seed: "rectangular-corner",
    options: { starts: 1, annealSteps: 0 }
  })[0];
  const horizontalGap = Math.abs(result.centerX - marker.x) - 60;
  const verticalGap = Math.abs(result.centerY - marker.y) - 25;

  assert.equal(layout.distancePointToBox(marker, result.box) >= 12, true);
  assert.equal(horizontalGap > 0, true);
  assert.equal(verticalGap > 0, true);
  assert.equal(Math.abs(horizontalGap - verticalGap) < 0.01, true);
});

test("open terrain still prefers a regular side or rectangle-aware corner position", () => {
  const width = 400;
  const height = 300;
  const marker = { id: "city", x: 200, y: 150 };
  const coastRects = [
    [263, 65, 29, 16],
    [159, 48, 87, 50],
    [52, 91, 96, 103],
    [274, 152, 74, 37],
    [134, 47, 109, 88],
    [161, 157, 96, 95],
    [132, 243, 41, 60]
  ];
  const avoidanceField = makeField(width, height, 4, ({
    columns,
    rows,
    coastMask
  }) => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = column * 4;
        const y = row * 4;
        if (coastRects.some(([left, top, rectWidth, rectHeight]) =>
          x >= left && x < left + rectWidth &&
          y >= top && y < top + rectHeight
        )) {
          coastMask[row * columns + column] = 255;
        }
      }
    }
  });
  const result = layout.planLabelLayout({
    labels: [{ id: "city", markerId: "city", width: 132, height: 60 }],
    markers: [marker],
    viewport: { x: 0, y: 0, width, height },
    avoidanceField,
    seed: "regular-open-terrain",
    options: { starts: 1, annealSteps: 0 }
  })[0];

  assert.equal(isStandardPlacement(result, marker, 132, 60), true);
});

test("regional card pressure prefers the open side over a mildly complex coastline", () => {
  const width = 600;
  const height = 420;
  const cellSize = 4;
  const columns = width / cellSize;
  const rows = height / cellSize;
  const coastMask = new Uint8Array(columns * rows);
  const landMask = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * cellSize;
      const y = row * cellSize;
      if (x >= 200 && x <= 400 && y >= 235 && y < 250) {
        coastMask[row * columns + column] = 255;
      }
    }
  }
  const markers = [
    { id: "istanbul", x: 300, y: 220 },
    { id: "london", x: 230, y: 110 },
    { id: "paris", x: 270, y: 145 },
    { id: "moscow", x: 350, y: 110 },
    { id: "berlin", x: 315, y: 145 }
  ];
  const result = layout.planLabelLayout({
    labels: labelsForMarkers(markers, { width: 100, height: 42 }),
    markers,
    viewport: { x: 0, y: 0, width, height },
    avoidanceField: layout.createAvoidanceField({
      width,
      height,
      cellSize,
      landMask,
      coastMask
    }),
    seed: "istanbul-regional-pressure",
    options: { starts: 4, annealSteps: 1500 }
  });
  const istanbul = result.find((entry) => entry.id === "istanbul");

  assert.equal(istanbul.centerY > 220, true);
});

test("regional card pressure removes incidental overlaps when surrounding space is available", () => {
  const markers = [
    { id: "edmonton", x: 165, y: 125 },
    { id: "london", x: 503, y: 135 },
    { id: "paris", x: 510, y: 147 },
    { id: "istanbul", x: 590, y: 180 },
    { id: "moscow", x: 615, y: 114 },
    { id: "dubai", x: 668, y: 236 },
    { id: "mumbai", x: 720, y: 257 },
    { id: "bangkok", x: 803, y: 273 },
    { id: "shanghai", x: 865, y: 216 },
    { id: "nagoya", x: 911, y: 202 }
  ];
  const result = layout.planLabelLayout({
    labels: labelsForMarkers(markers, { width: 132, height: 60 }),
    markers,
    viewport: { x: 0, y: 0, width: 1072, height: 584 },
    seed: "asia-cluster"
  });

  assertNoOverlaps(result);
});

test("label spacing outranks terrain coverage without a secondary relaxation pass", () => {
  const width = 700;
  const height = 420;
  const markers = [
    { id: "c0", x: 447, y: 256 },
    { id: "c1", x: 459, y: 167 },
    { id: "c2", x: 355, y: 231 },
    { id: "c3", x: 329, y: 234 },
    { id: "c4", x: 475, y: 196 }
  ];
  const coastRects = [
    [251, 338, 54, 89],
    [128, 144, 69, 45],
    [543, 261, 62, 23],
    [525, 192, 91, 26],
    [205, 116, 106, 31],
    [424, 208, 147, 106],
    [438, 125, 56, 58]
  ];
  const avoidanceField = makeField(width, height, 4, ({
    columns,
    rows,
    coastMask
  }) => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = column * 4;
        const y = row * 4;
        if (coastRects.some(([left, top, rectWidth, rectHeight]) =>
          x >= left && x < left + rectWidth &&
          y >= top && y < top + rectHeight
        )) {
          coastMask[row * columns + column] = 255;
        }
      }
    }
  });
  const result = layout.planLabelLayout({
    labels: labelsForMarkers(markers, { width: 120, height: 50 }),
    markers,
    viewport: { x: 0, y: 0, width, height },
    avoidanceField,
    seed: "global-fallback-4",
    options: { starts: 2, annealSteps: 500 }
  });

  for (const entry of result) {
    const marker = markers.find((candidate) => candidate.id === entry.id);
    assert.equal(layout.distancePointToBox(marker, entry.box) <= 37, true, entry.id);
  }
  assertNoOverlaps(result);
});

test("planner uses comfortable spacing when the viewport has room", () => {
  const result = layout.planLabelLayout({
    labels: [
      { id: "left", markerId: "left", width: 100, height: 42 },
      { id: "right", markerId: "right", width: 100, height: 42 }
    ],
    markers: [
      { id: "left", x: 210, y: 130 },
      { id: "right", x: 290, y: 130 }
    ],
    viewport: { x: 0, y: 0, width: 520, height: 280 },
    seed: "comfortable-gap"
  });

  assert.equal(boxGap(result[0].box, result[1].box) >= 8, true);
});

test("crowded layouts retain every card and prefer small overlaps over excessive distance", () => {
  const labels = Array.from({ length: 9 }, (_, index) => ({
    id: `city-${index}`,
    markerId: `city-${index}`,
    width: 86,
    height: 38
  }));
  const markers = labels.map((label, index) => ({
    id: label.id,
    x: 120 + (index % 3) * 12,
    y: 80 + Math.floor(index / 3) * 12
  }));
  const result = layout.planLabelLayout({
    labels,
    markers,
    viewport: { x: 0, y: 0, width: 260, height: 180 },
    seed: "crowded"
  });

  assert.equal(result.length, labels.length);
  assert.equal(new Set(result.map((entry) => entry.id)).size, labels.length);
  for (const entry of result) {
    const marker = markers.find((candidate) => candidate.id === entry.id);
    assert.equal(layout.distancePointToBox(marker, entry.box) <= 72.001, true);
  }
});

test("default search budget reduces avoidable overlap in a dense regional cluster", () => {
  const markers = [
    { id: "c0", x: 212.63175398577005, y: 174.79667705483735 },
    { id: "c1", x: 204.01105483528227, y: 211.44695184659213 },
    { id: "c2", x: 299.06177955213934, y: 130.2397987805307 },
    { id: "c3", x: 207.0439990563318, y: 176.40439920593053 },
    { id: "c4", x: 264.53750644344836, y: 205.57028933428228 },
    { id: "c5", x: 296.7518221726641, y: 128.93469193484634 },
    { id: "c6", x: 272.1592583367601, y: 217.53766663372517 },
    { id: "c7", x: 253.41246779542416, y: 173.10235420707613 },
    { id: "c8", x: 172.52743520308286, y: 159.46985588409007 },
    { id: "c9", x: 346.6136482125148, y: 169.37117930036038 },
    { id: "c10", x: 333.26521838549525, y: 201.75719836726785 },
    { id: "c11", x: 303.3400025917217, y: 165.77671494800597 },
    { id: "c12", x: 214.4983069272712, y: 134.37747585587204 },
    { id: "c13", x: 202.7985364338383, y: 134.0303893154487 },
    { id: "c14", x: 183.10418515000492, y: 162.8682006523013 },
    { id: "c15", x: 263.29484227579087, y: 158.21152760181576 },
    { id: "c16", x: 223.543421481736, y: 191.65242125280201 },
    { id: "c17", x: 311.4726016437635, y: 176.20350926648825 }
  ];
  const labels = labelsForMarkers(markers, (_marker, index) => ({
    width: 86 + index % 3 * 12,
    height: 38 + index % 2 * 4
  }));
  const result = layout.planLabelLayout({
    labels,
    markers,
    viewport: { x: 0, y: 0, width: 560, height: 360 },
    seed: "s2"
  });

  assert.equal(result.length, labels.length);
  assert.equal(totalOverlapArea(result) < DENSE_CLUSTER_MAX_OVERLAP, true);
});

test("connectors appear only after the threshold and terminate on the nearest card edge", () => {
  const near = layout.planLabelLayout({
    labels: [{ id: "near", markerId: "near", width: 80, height: 36 }],
    markers: [{ id: "near", x: 150, y: 100 }],
    viewport: { x: 0, y: 0, width: 300, height: 200 },
    seed: "near",
    options: { candidateGaps: [10] }
  })[0];
  const medium = layout.planLabelLayout({
    labels: [{ id: "medium", markerId: "medium", width: 80, height: 36 }],
    markers: [{ id: "medium", x: 150, y: 100 }],
    viewport: { x: 0, y: 0, width: 300, height: 200 },
    seed: "medium",
    options: { candidateGaps: [26] }
  })[0];
  const far = layout.planLabelLayout({
    labels: [{ id: "far", markerId: "far", width: 80, height: 36 }],
    markers: [{ id: "far", x: 150, y: 100 }],
    viewport: { x: 0, y: 0, width: 300, height: 200 },
    seed: "far",
    options: { candidateGaps: [52] }
  })[0];

  assert.equal(near.connector, null);
  assert.equal(medium.connector, null);
  assert.notEqual(far.connector, null);
  assert.equal(Math.abs(layout.distancePointToBox(far.connector.to, far.box)) < 0.001, true);
  assert.deepEqual(far.connector.from, { x: 150, y: 100 });
});

test("default connector threshold scales with the rendered card size", () => {
  const small = layout.planLabelLayout({
    labels: [{ id: "small", markerId: "small", width: 74, height: 30 }],
    markers: [{ id: "small", x: 170, y: 110 }],
    viewport: { x: 0, y: 0, width: 340, height: 220 },
    seed: "small-threshold",
    options: { candidateGaps: [42], starts: 1, descentPasses: 0, finalPasses: 0, annealSteps: 0 }
  })[0];
  const large = layout.planLabelLayout({
    labels: [{ id: "large", markerId: "large", width: 170, height: 78 }],
    markers: [{ id: "large", x: 170, y: 110 }],
    viewport: { x: 0, y: 0, width: 480, height: 280 },
    seed: "large-threshold",
    options: { candidateGaps: [42], starts: 1, descentPasses: 0, finalPasses: 0, annealSteps: 0 }
  })[0];

  assert.notEqual(small.connector, null);
  assert.equal(large.connector, null);
});

test("small cards do not inherit a desktop-sized maximum displacement floor", () => {
  const marker = { id: "small", x: 160, y: 120 };
  const result = layout.planLabelLayout({
    labels: [{ id: "small", markerId: "small", width: 80, height: 36 }],
    markers: [marker],
    viewport: { x: 0, y: 0, width: 360, height: 240 },
    seed: "small-distance-floor",
    options: { candidateGaps: [200], starts: 1, descentPasses: 0, finalPasses: 0, annealSteps: 0 }
  })[0];

  assert.equal(layout.distancePointToBox(marker, result.box) <= SMALL_CARD_MAX_DISTANCE, true);
});

test("zero-valued planner options are preserved instead of replaced by defaults", () => {
  const marker = { id: "city", x: 150, y: 100 };
  const result = layout.planLabelLayout({
    labels: [{ id: "city", markerId: "city", width: 80, height: 36 }],
    markers: [marker],
    viewport: { x: 0, y: 0, width: 300, height: 200 },
    seed: "zero-options",
    options: {
      candidateGaps: [12],
      connectorThreshold: 0,
      starts: 1,
      descentPasses: 0,
      finalPasses: 0,
      annealSteps: 0
    }
  })[0];
  const edgeToEdge = layout.planLabelLayout({
    labels: [{ id: "full", markerId: "full", width: 100, height: 100 }],
    markers: [{ id: "full", x: 50, y: 50 }],
    viewport: { x: 0, y: 0, width: 100, height: 100 },
    seed: "zero-margin",
    options: {
      margin: 0,
      starts: 1,
      descentPasses: 0,
      finalPasses: 0,
      annealSteps: 0
    }
  })[0];

  assert.notEqual(result.connector, null);
  assert.deepEqual(edgeToEdge.box, { left: 0, right: 100, top: 0, bottom: 100 });
});

test("rectangle-aware corner positions do not create short decorative connectors", () => {
  const marker = { id: "city", x: 200, y: 150 };
  const result = layout.planLabelLayout({
    labels: [{ id: "city", markerId: "city", width: 120, height: 50 }],
    markers: [
      marker,
      { id: "north", x: 200, y: 99 },
      { id: "south", x: 200, y: 201 },
      { id: "east", x: 286, y: 150 },
      { id: "west", x: 114, y: 150 }
    ],
    viewport: { x: 0, y: 0, width: 400, height: 300 },
    seed: "corner-connector",
    options: { candidateGaps: [26], starts: 1, annealSteps: 0 }
  })[0];

  assert.equal(Math.abs(layout.distancePointToBox(marker, result.box) - 26) < 0.01, true);
  assert.equal(result.connector, null);
});

test("line geometry detects crossings without treating shared endpoints as crossings", () => {
  assert.equal(layout.segmentsIntersect(
    { from: { x: 0, y: 0 }, to: { x: 10, y: 10 } },
    { from: { x: 0, y: 10 }, to: { x: 10, y: 0 } }
  ), true);
  assert.equal(layout.segmentsIntersect(
    { from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
    { from: { x: 10, y: 0 }, to: { x: 20, y: 0 } }
  ), false);
});

test("wrapped map rings unwrap continuously across either world seam", () => {
  assert.deepEqual(
    layout.unwrapProjectedRing([
      { x: 990, y: 20 },
      { x: 5, y: 22 },
      { x: 18, y: 25 }
    ], 1000),
    [
      { x: 990, y: 20 },
      { x: 1005, y: 22 },
      { x: 1018, y: 25 }
    ]
  );
  assert.deepEqual(
    layout.unwrapProjectedRing([
      { x: 12, y: 40 },
      { x: 994, y: 42 },
      { x: 980, y: 45 }
    ], 1000),
    [
      { x: 12, y: 40 },
      { x: -6, y: 42 },
      { x: -20, y: 45 }
    ]
  );
});

test("large city sets keep every label without a planner-side count limit", () => {
  const labels = Array.from({ length: 120 }, (_, index) => {
    const id = `city-${String(index).padStart(3, "0")}`;
    return {
      id,
      markerId: id,
      width: 72 + index % 4 * 8,
      height: 34
    };
  });
  const markers = labels.map((label, index) => ({
    id: label.id,
    x: 60 + (index % 15) * 82,
    y: 60 + Math.floor(index / 15) * 64
  }));
  const result = layout.planLabelLayout({
    labels,
    markers,
    viewport: { x: 0, y: 0, width: 1280, height: 720 },
    seed: "large-smoke",
    options: {
      starts: 2,
      descentPasses: 4,
      finalPasses: 2,
      annealSteps: 1200
    }
  });

  assert.equal(result.length, labels.length);
  assert.equal(new Set(result.map((entry) => entry.id)).size, labels.length);
});
