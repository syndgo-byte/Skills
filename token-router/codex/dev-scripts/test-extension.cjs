const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const bars=[], warnings=[], messages=[];let provider;
const fixture={id:'fixture',cwd:'D:\\',model:'gpt-6-astra',effort:'low',context:81000,window:258400,updated:Date.now()/1000,blocked:true,message:'Change <model>',recommendation:{model:'gpt-6-sol',effort:'medium'}};
const fakefs={
 readdirSync:p=>p.endsWith(path.join('token-router','sessions'))?['fixture.json']:[],
 readFileSync:p=>p.endsWith('fixture.json')?JSON.stringify(fixture):'{}',
 existsSync:()=>false
};
const disposable={dispose(){}};
const vscode={StatusBarAlignment:{Left:1,Right:2},TabInputWebview:class{},
 workspace:{workspaceFolders:[{uri:{fsPath:'D:\\'}}]},
 window:{createStatusBarItem(){const b={show(){this.visible=true},hide(){this.visible=false},dispose(){}};bars.push(b);return b},
 registerWebviewViewProvider(id,p){provider=p;return disposable},
 tabGroups:{all:[],onDidChangeTabs:()=>disposable,onDidChangeTabGroups:()=>disposable},
 showWarningMessage:m=>{warnings.push(m);return Promise.resolve()}},
 commands:{registerCommand:()=>disposable,executeCommand:()=>{}}};
const sandbox={exports:{},require:n=>n==='vscode'?vscode:n==='fs'?fakefs:n==='os'?{homedir:()=> 'C:\\fixture'}:require(n),process:{env:{}},console,setInterval:()=>1,clearInterval:()=>{}};
vm.runInNewContext(fs.readFileSync('D:/Claude_Skills/token-router/extension/dist/extension.js','utf8'),sandbox);
sandbox.exports.activate({subscriptions:[]});
const view={webview:{postMessage:d=>messages.push(d)},onDidChangeVisibility:()=>disposable};
provider.resolveWebviewView(view);
assert(bars.some(b=>b.text?.includes('Codex 81.0k')));
assert.equal(warnings.length,1);assert.equal(messages.at(-1).codexSessions.length,1);
let listener;const element={innerHTML:''};
const htmlScript=view.webview.html.match(/<script>([\s\S]*?)<\/script>/)[1];
vm.runInNewContext(htmlScript,{window:{addEventListener:(n,f)=>listener=f},document:{getElementById:()=>element}});
listener({data:messages.at(-1)});
assert(element.innerHTML.includes('gpt-6-sol'));
assert(element.innerHTML.includes('Change &lt;model&gt;'));
console.log('PASS: hook telemetry -> status bar, warning, sidebar; D drive workspace; escaped HTML');
