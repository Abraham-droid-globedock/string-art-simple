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
const maxLines = 2000; // Increased for fuller images
const darkeningAmount = 1; // Smaller for more layers
let nailSequence = [];

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
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            const imageData = ctx.getImageData(0, 0, width, height);
            // Convert to grayscale for simplicity
            for (let i = 0; i < imageData.data.length; i += 4) {
                const gray = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
                imageData.data[i] = imageData.data[i + 1] = imageData.data[i + 2] = gray;
            }
            resolve(imageData);
        };
        img.src = URL.createObjectURL(file);
    });
}

function calculateDelta(imageData, line, currentImage) {
    // Calculate delta error improvement along the line
    let delta = 0;
    const pixels = getLinePixels(line.x0, line.y0, line.x1, line.y1);
    pixels.forEach(([px, py]) => {
        const idx = (Math.floor(py) * width + Math.floor(px)) * 4;
        const original = imageData.data[idx]; // Grayscale value (0 dark, 255 light)
        const current = currentImage[idx] || 255;
        const newValue = Math.max(0, current - darkeningAmount);
        const improvement = Math.pow(original - newValue, 2) - Math.pow(original - current, 2);
        delta += Math.min(0, improvement); // Ignore worsenings
    });
    return delta;
}

function getLinePixels(x0, y0, x1, y1) {
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
    return pixels;
}

async function generateStringArt() {
    const file = imageInput.files[0];
    if (!file) {
        alert("Please upload an image!");
        return;
    }

    status.textContent = "Generating...";
    // Clear previous output
    svg.selectAll("*").remove();
    nailSequence = [];

    // Load and process image
    const imageData = await loadImage(file);
    const currentImage = new Uint8ClampedArray(width * height * 4).fill(255); // White background
    const nailPositions = generateNailPositions();

    // Draw nails
    svg.selectAll("circle")
        .data(nailPositions)
        .enter()
        .append("circle")
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .attr("r", 2)
        .attr("fill", "black");

    // Generate string art
    let currentNail = 0;
    for (let i = 0; i < maxLines; i++) {
        let minDelta = 0; // Start at 0, since we want negative deltas
        let bestNail = -1;
        for (let j = 0; j < nails; j++) {
            if (j === currentNail) continue;
            const line = {
                x0: nailPositions[currentNail].x,
                y0: nailPositions[currentNail].y,
                x1: nailPositions[j].x,
                y1: nailPositions[j].y
            };
            const delta = calculateDelta(imageData, line, currentImage);
            if (delta < minDelta) {
                minDelta = delta;
                bestNail = j;
            }
        }
        if (bestNail === -1 || minDelta >= 0) break; // Stop if no improvement

        // Draw line
        svg.append("line")
            .attr("x1", nailPositions[currentNail].x)
            .attr("y1", nailPositions[currentNail].y)
            .attr("x2", nailPositions[bestNail].x)
            .attr("y2", nailPositions[bestNail].y)
            .attr("stroke", "black")
            .attr("stroke-width", 0.5)
            .attr("stroke-opacity", 0.5); // Slight transparency for layering

        // Update current image
        const pixels = getLinePixels(
            nailPositions[currentNail].x,
            nailPositions[currentNail].y,
            nailPositions[bestNail].x,
            nailPositions[bestNail].y
        );
        pixels.forEach(([px, py]) => {
            const idx = (Math.floor(py) * width + Math.floor(px)) * 4;
            currentImage[idx] = Math.max(0, (currentImage[idx] || 255) - darkeningAmount);
            currentImage[idx + 1] = currentImage[idx];
            currentImage[idx + 2] = currentImage[idx];
            currentImage[idx + 3] = 255;
        });

        nailSequence.push([currentNail, bestNail]);
        currentNail = bestNail;
        console.log(`Added line ${i + 1}`); // For debugging
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
