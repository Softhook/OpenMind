#!/usr/bin/env node
/**
 * Syncs version.js with package.json version
 * Run: node scripts/sync-version.js
 * Or automatically via: npm version [patch|minor|major]
 */

const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '..', 'package.json');
const versionPath = path.join(__dirname, '..', 'version.js');

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);

const content = `/**
 * OpenMind Version Constants
 * AUTO-GENERATED - Do not edit manually!
 * Run: npm version [patch|minor|major] to update
 */

const APP_VERSION = {
    MAJOR: ${major},
    MINOR: ${minor},
    PATCH: ${patch},
    
    toString() {
        return \`\${this.MAJOR}.\${this.MINOR}.\${this.PATCH}\`;
    },
    
    toProtocolVersion() {
        return \`\${this.MAJOR}.\${this.MINOR}\`;
    },
    
    checkCompatibility(other) {
        if (!other || typeof other.MAJOR !== 'number') {
            // Unknown version = incompatible (client is too old to have version support)
            return { compatible: false, shouldWarn: true, reason: 'Peer is running an outdated version without version support' };
        }
        
        if (other.MAJOR !== this.MAJOR) {
            const isOlder = other.MAJOR < this.MAJOR;
            return {
                compatible: false,
                shouldWarn: true,
                reason: isOlder 
                    ? 'Peer has older version - they need to refresh'
                    : 'You need to refresh - a newer version is available'
            };
        }
        
        if (other.MINOR > this.MINOR) {
            return {
                compatible: true,
                shouldWarn: true,
                reason: 'A newer version is available - consider refreshing'
            };
        }
        
        return { compatible: true, shouldWarn: false, reason: '' };
    }
};

const APP_NAME = 'OpenMind';

Object.freeze(APP_VERSION);
`;

fs.writeFileSync(versionPath, content);
console.log(`✓ Synced version.js to v${pkg.version}`);
