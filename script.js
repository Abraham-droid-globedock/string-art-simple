// UI Setup
class Button {
    constructor(desc, name, parent, callback) {
        this.element = document.createElement("button");
        this.element.id = name;
        this.element.innerHTML = desc;
        this.element.addEventListener("click", callback);
        parent.appendChild(this.element);
    }
}

let controls = document.getElementById("controls");
let gui = {
    init() {
        this.generate = new Button("Generate", "generate", controls, generateStringArt);
        this.download = new Button("Download Nail Sequence", "download", controls, downloadNailSequence);
    }
};
gui.init();

// Image Preview
const imageInput = document.getElementById("imageInput");
const preview = document.getElementById("preview");
imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    if (file) {
        preview.src = URL.createObjectURL(file);
    }
});

// String Art Logic
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
const svg = d3.select("#output");
const status = document.getElementById("status");
const width = 500;
const height = 500;
const nails = 100; // Number of nails on circular frame
const maxLines = 2000; // Maximum string connections
const downscaleFactor = 5; // Downscale to 100x100 for simplicity
const darkeningAmount = 1; // Small change per line
let nailSequence = [];
let nailPositions = []; // Moved to global scope

function generateNailPositions() {
    const positions = [];
    const radius = width / 2 - 10; // Slight inset for visibility
    const centerX = width / 2;
    const centerY = height / 2;
    for (let i = 0; i < nails; i++) {
        const angle = (i / nails) * 2 * Math.PI;
        positions.push({
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle)
        });
    }
    return positions;
}

function loadImage(file) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            // Downscale to 100x100
            const smallCanvas = document.createElement("canvas");
            smallCanvas.width = width / downscaleFactor;
            smallCanvas.height = height / downscaleFactor;
            const smallCtx = smallCanvas.getContext("2d");
            smallCtx.drawImage(img, 0, 0, smallCanvas.width, smallCanvas.height);
            const smallImageData = smallCtx.getImageData(0, 0, smallCanvas.width, smallCanvas.height);
            // Convert to grayscale
            for (let i = 0; i < smallImageData.data.length; i += 4) {
                const gray = (smallImageData.data[i] + smallImageData.data[i + 1] + smallImageData.data[i + 2]) / 3;
                smallImageData.data[i] = smallImageData.data[i + 1] = smallImageData.data[i + 2] = gray;
            }
            resolve(smallImageData);
        };
        img.src = URL.createObjectURL(file);
    });
}

function calculateDelta(imageData, line, currentImage) {
    let delta = 0;
    const pixels = getLinePixels(line.x0, line.y0, line.x1, line.y1, downscaleFactor);
    const scale = downscaleFactor;
    pixels.forEach(([px, py]) => {
        const idx = (Math.floor(py / scale) * (width / scale) + Math.floor(px / scale)) * 4;
        if (idx >= 0 && idx < currentImage.length) {
            const original = imageData.data[idx];
            const current = currentImage[idx] || 255;
            const newValue = Math.max(0, current - darkeningAmount);
            const improvement = Math.pow(original - newValue, 2) - Math.pow(original - current, 2);
            delta += Math.min(0, improvement) * (1 - original / 255); // Weight by darkness
        }
    });
    return delta / (pixels.length || 1); // Normalize by line length
}

function getLinePixels(x0, y0, x1, y1, scale) {
    const pixels = [];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0, y = y0;
    while (true) {
        pixels.push([x, y]);
        if (Math.abs(x - x1) < 1 && Math.abs(y - y1) < 1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
    }
    return pixels.map(([x, y]) => [x * scale, y * scale]); // Scale back to original size
}

function hasOverlap(newLine, existingLines, positions, threshold = 5) {
    // Check if new line overlaps significantly with existing lines
    for (let [from, to] of existingLines) {
        const line1 = { x0: positions[from].x, y0: positions[from].y, x1: positions[to].x, y1: positions[to].y };
        const line2 = newLine;
        const dist = Math.min(
            distanceToLineSegment(line1, { x: line2.x0, y: line2.y0 }),
            distanceToLineSegment(line1, { x: line2.x1, y: line2.y1 })
        );
        if (dist < threshold) return true;
    }
    return false;
}

function distanceToLineSegment(line, point) {
    const { x0, y0, x1, y1 } = line;
    const l2 = (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0);
    if (l2 === 0) return Math.hypot(point.x - x0, point.y - y0);
    let t = Math.max(0, Math.min(1, ((point.x - x0) * (x1 - x0) + (point.y - y0) * (y1 - y0)) / l2));
    let px = x0 + t * (x1 - x0);
    let py = y0 + t * (y1 - y0);
    return Math.hypot(point.x - px, point.y - py);
}

async function generateStringArt() {
    const file = imageInput.files[0];
    if (!file) {
        alert("Please upload an image!");
        return;
    }

    status.textContent = "Generating...";
    svg.selectAll("*").remove();
    nailSequence = [];
    nailPositions = generateNailPositions(); // Initialize here

    const imageData = await loadImage(file);
    const currentImage = new Uint8ClampedArray((width / downscaleFactor) * (height / downscaleFactor) * 4).fill(255);

    // Draw nails
    svg.selectAll("circle")
        .data(nailPositions)
        .enter()
        .append("circle")
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .attr("r", 2)
        .attr("fill", "black");

    // Generate string art with random start
    let currentNail = Math.floor(Math.random() * nails);
    for (let i = 0; i < maxLines; i++) {
        let minDelta = 0;
        let bestNail = -1;
        for (let j = 0; j < nails; j++) {
            if (j === currentNail) continue;
            const line = {
                x0: nailPositions[currentNail].x,
                y0: nailPositions[currentNail].y,
                x1: nailPositions[j].x,
                y1: nailPositions[j].y
            };
            if (hasOverlap(line, nailSequence, nailPositions)) continue; // Skip overlapping lines
            const delta = calculateDelta(imageData, line, currentImage);
            if (delta < minDelta) {
                minDelta = delta;
                bestNail = j;
            }
        }
        if (bestNail === -1 || minDelta >= -0.1) {
            console.log(`Stopped at line ${i + 1} due to no improvement`);
            break;
        }

        const newLine = {
            x0: nailPositions[currentNail].x,
            y0: nailPositions[currentNail].y,
            x1: nailPositions[bestNail].x,
            y1: nailPositions[bestNail].y
        };
        svg.append("line")
            .attr("x1", newLine.x0)
            .attr("y1", newLine.y0)
            .attr("x2", newLine.x1)
            .attr("y2", newLine.y1)
            .attr("stroke", "black")
            .attr("stroke-width", 0.5)
            .attr("stroke-opacity", 0.5);

        const pixels = getLinePixels(newLine.x0, newLine.y0, newLine.x1, newLine.y1, downscaleFactor);
        pixels.forEach(([px, py]) => {
            const idx = (Math.floor(py / downscaleFactor) * (width / downscaleFactor) + Math.floor(px / downscaleFactor)) * 4;
            if (idx >= 0 && idx < currentImage.length) {
                currentImage[idx] = Math.max(0, (currentImage[idx] || 255) - darkeningAmount);
                currentImage[idx + 1] = currentImage[idx];
                currentImage[idx + 2] = currentImage[idx];
                currentImage[idx + 3] = 255;
            }
        });

        nailSequence.push([currentNail, bestNail]);
        currentNail = bestNail;
        console.log(`Added line ${i + 1}`);
    }
    status.textContent = `Generation complete! ${nailSequence.length} lines added.`;
}

function downloadNailSequence() {
    if (nailSequence.length === 0) {
        alert("Generate a string art first!");
        return;
    }
    const text = nailSequence.map(([from, to]) => `From nail ${from + 1} to nail ${to + 1}`).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nail_sequence.txt";
    a.click();
    URL.revokeObjectURL(url);
}
