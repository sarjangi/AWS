// convert-to-commonjs.js
const fs = require('fs');
const path = require('path');

function convertFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace import statements
    content = content.replace(/import\s+([^ ]+)\s+from\s+['"]([^'"]+)['"]/g, 'const $1 = require(\'$2\')');
    content = content.replace(/export\s+([^;]+);/g, 'exports.$1 = $1;');
    content = content.replace(/export\s+default\s+([^;]+);/g, 'module.exports = $1;');
    content = content.replace(/export\s+{\s*([^}]+)\s*};/g, (match, exports) => {
        const items = exports.split(',').map(item => item.trim());
        return items.map(item => `exports.${item} = ${item};`).join('\n');
    });
    
    fs.writeFileSync(filePath, content);
    console.log(`✅ Converted: ${filePath}`);
}

// Convert key files
const filesToConvert = [
    'src/ingestion/data-processor.js',
    'src/database/database-service.js',
    'src/transformation/canonical-mapper.js',
    'src/api/query-api.js'
];

filesToConvert.forEach(file => {
    if (fs.existsSync(file)) {
        convertFile(file);
    }
});

console.log('🎉 All files converted to CommonJS!');
console.log('💡 Now run: cd infrastructure && cdk deploy');