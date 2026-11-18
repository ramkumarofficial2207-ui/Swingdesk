const fs = require('fs');
const path = require('path');
const https = require('https');

const url = 'https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv';
const target = path.join(__dirname, '..', 'data', 'nifty500-constituents.csv');

https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/csv,*/*' }, timeout: 30000 }, response => {
    if (response.statusCode !== 200) throw new Error(`Nifty Indices returned HTTP ${response.statusCode}`);
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => {
        const csv = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '');
        const lines = csv.split(/\r?\n/).filter(Boolean);
        const header = lines.shift()?.split(',').map(value => value.trim().toLowerCase()) ?? [];
        const column = header.indexOf('symbol');
        const symbols = new Set(lines.map(line => line.split(',')[column]?.trim().toUpperCase()).filter(Boolean));
        if (column < 0 || symbols.size < 450 || symbols.size > 550) throw new Error(`Invalid constituent file (${symbols.size} symbols)`);
        fs.writeFileSync(target, csv);
        console.log(`Updated ${target} with ${symbols.size} Nifty 500 symbols.`);
    });
}).on('error', error => { console.error(error.message); process.exitCode = 1; });
