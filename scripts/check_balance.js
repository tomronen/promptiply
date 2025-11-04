const fs = require('fs');
const path = process.argv[2];
if(!path){ console.error('Usage: node check_balance.js <file>'); process.exit(2); }
const s = fs.readFileSync(path,'utf8');
const stack = [];
const pairs = { '{':'}','[':']','(':')' };
const opens = Object.keys(pairs);
const closes = Object.values(pairs);
let line=1,col=0;
for(let i=0;i<s.length;i++){
  const ch = s[i];
  if(ch==='\n'){ line++; col=0; continue; }
  col++;
  if(opens.includes(ch)) stack.push({ch, line, col});
  else if(closes.includes(ch)){
    const last = stack.pop();
    const expected = last ? pairs[last.ch] : null;
    if(expected !== ch){
      console.error(`MISMATCH at ${line}:${col} - found '${ch}' expected '${expected||"<none>"}'`);
      console.error('Context:', s.split('\n').slice(Math.max(0,line-3),line+2).join('\n'));
      process.exit(1);
    }
  }
}
if(stack.length) {
  const last = stack[stack.length-1];
  console.error(`UNMATCHED open '${last.ch}' at ${last.line}:${last.col}`);
  process.exit(1);
}
console.log('All parentheses/braces/brackets match.');
