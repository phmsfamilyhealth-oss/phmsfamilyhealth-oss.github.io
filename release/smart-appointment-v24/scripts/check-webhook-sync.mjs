#!/usr/bin/env node
// PHMS v2.4: safe webhook source reconciliation guard.
// Usage: node scripts/check-webhook-sync.mjs <deployed-index.ts> <github-index.ts>
// Inputs must stay in a private runner. NEVER commit downloaded secrets/tokens.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [prod,git]=process.argv.slice(2);
if(!prod||!git){console.error('Provide private deployed source and GitHub source paths');process.exit(2)}
const read=path=>readFileSync(path);
const sha=b=>createHash('sha256').update(b).digest('hex');
const blob=b=>createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
const p=read(prod),g=read(git);
const tokenIndicators=[
 /ghp_[A-Za-z0-9]{25,}/g,
 /(?:sk_[a-z0-9_-]{20,})/gi,
 /eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
];
const flagged=tokenIndicators.reduce((n,re)=>n+[...(p.toString('utf8').matchAll(re))].length,0);
console.log(JSON.stringify({productionBytes:p.length,githubBytes:g.length,productionSHA256:sha(p),githubSHA256:sha(g),productionGitBlob:blob(p),githubGitBlob:blob(g),equal:p.equals(g),potentialEmbeddedTokens:flagged},null,2));
if(flagged){console.error('SECURITY GATE: potential embedded token patterns detected. Do not publish production source until reviewed privately.');process.exit(3)}
if(!p.equals(g)){console.error('PARITY GATE: sources differ. Rebase from safe reviewed deployed source on protected branch, run CI and recheck live version before release.');process.exit(1)}
