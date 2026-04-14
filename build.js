const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const outdir = 'dist';
if (!fs.existsSync(outdir)) fs.mkdirSync(outdir);

// Copy static assets
['manifest.json', 'src/popup.html', 'src/styles.css'].forEach(file => {
    // some static files might be at the root (manifest.json) or src
    let srcFile = file;
    if (file === 'manifest.json') {
        // keep it as is
    } else {
        srcFile = file;
    }
    if (fs.existsSync(srcFile)) {
        const dest = path.join(outdir, path.basename(file));
        fs.copyFileSync(srcFile, dest);
        console.log(`Copied ${srcFile} to ${dest}`);
    }
});

// Build TypeScript
esbuild.build({
    entryPoints: ['src/background.ts', 'src/contentScript.ts', 'src/popup.ts'],
    bundle: true,
    outdir: outdir,
    target: ['chrome100'],
    format: 'iife',
    minify: false
}).then(() => {
    console.log('Build completed successfully.');
}).catch((err) => {
    console.error('Build failed', err);
    process.exit(1);
});
