"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const PermissionServer_1 = require("./PermissionServer");
const WebviewProvider_1 = require("./WebviewProvider");
async function activate(context) {
    const server = new PermissionServer_1.PermissionServer();
    context.subscriptions.push(server);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('permissionManagerView', new WebviewProvider_1.WebviewProvider(context.extensionUri, server), {
        webviewOptions: { retainContextWhenHidden: true },
    }));
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
    status.command = 'permissionManagerView.focus';
    status.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    context.subscriptions.push(status);
    let previous = 0;
    server.onDidChange(() => {
        const count = server.list().length;
        if (count > 0) {
            status.text = `$(lock) Claude 허가 대기 ${count}`;
            status.show();
        }
        else {
            status.hide();
        }
        if (previous === 0 && count > 0) {
            vscode.window.showInformationMessage('Claude Code가 허가를 기다리고 있어요.', '열기').then((choice) => {
                if (choice)
                    vscode.commands.executeCommand('permissionManagerView.focus');
            });
        }
        previous = count;
    });
    context.subscriptions.push(vscode.commands.registerCommand('permissionManager.open', () => vscode.commands.executeCommand('permissionManagerView.focus')));
    await server.start();
}
function deactivate() { }
