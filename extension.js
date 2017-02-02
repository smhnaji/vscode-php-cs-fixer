'use strict';
var vscode = require('vscode');
var fs = require('fs');
var os = require('os');
var cp = require('child_process');
var TmpDir = os.tmpdir();
var PHPCSFixer = (function () {
    function PHPCSFixer() {
        var config = vscode.workspace.getConfiguration('php-cs-fixer');
        this.save = config.get('onsave', false);
        this.executable = config.get('executablePath', process.platform === "win32" ? "php-cs-fixer.bat" : "php-cs-fixer");
        this.rules = config.get('rules', '@PSR2');
        this.config = config.get('config', '.php_cs');
    }
    PHPCSFixer.prototype.dispose = function () {
        this.command.dispose();
        this.saveCommand.dispose();
    };

    PHPCSFixer.prototype.activate = function (context) {
        var self = this;
        if (this.save) {
            this.saveCommand = vscode.workspace.onDidSaveTextDocument(function (document) {
                if(document.fileName == vscode.window.activeTextEditor.document.fileName){
                    self.fix(document);
                }
            });
        }
        this.command = vscode.commands.registerTextEditorCommand('php-cs-fixer.fix', function (textEditor) {
            self.fix(textEditor.document);
        });
        this.autoFixCommand = vscode.commands.registerTextEditorCommand('php-cs-fixer.autoFix', function (textEditor) {
            self.autoFix(textEditor.document);
        });
        context.subscriptions.push(this);
    };

    PHPCSFixer.prototype.createRandomFile = function (content) {
        var tmpFileName = TmpDir + '/temp-' + Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 10) + '.php';
        fs.writeFileSync(tmpFileName, content);
        return tmpFileName;
    };

    PHPCSFixer.prototype.getArgs = function(fileName){
       var args = ['fix', fileName];
        var useConfig = false;
        if(this.config.length>0){
            var files = [];
            var r=vscode.workspace.rootPath;
            if(r==undefined){
                files = [this.config];
            }else{
                files = [this.config, r + '/.vscode/' + this.config, r + '/' + this.config];
            }
            for(var i=0, len=files.length; i<len; i++){
                var c = files[i];
                if(fs.existsSync(c)){
                    args.push('--config='+c);
                    useConfig = true;
                    break;
                }
            }
        }
        if (!useConfig && this.rules) {
            args.push('--rules=' + this.rules);
        }
        return args;
    };

    PHPCSFixer.prototype.fixIt = function (document, text, editRange, removeTags) {
        if (document.languageId !== 'php') {
            return;
        }
        var fileName = this.createRandomFile(text);
        var stdout = '';
        var stderr = '';

        var exec = cp.spawn(this.executable, this.getArgs(fileName));
        exec.stdout.on('data', function (buffer) {
            stdout += buffer.toString();
        });
        exec.stderr.on('data', function (buffer) {
            console.log(buffer.toString());
            stderr += buffer.toString();
        });
        exec.on('close', function (code) {
            switch (code) {
                case 0:
                case 1:
                    var fixed = fs.readFileSync(fileName, 'utf-8');
                    if(fixed.length> 0 && removeTags){
                        var match = fixed.match(/^<\?php\s+?if\s*\(\s*1\s*\)\s*\{([\s\S]+?)\}\s*$/i);
                        if(match!=null){
                            fixed = match[1];
                        }else{
                            console.log("parse fixed code error");
                            break;
                        }
                    }
                    vscode.window.activeTextEditor.edit(function(builder){
                        builder.replace(editRange, fixed);
                    });

                    vscode.window.setStatusBarMessage('PHP CS Fixer: ' + stdout.match(/^Fixed.*/m)[0] + '.', 4000);
                    break;
                case 16:
                    vscode.window.showErrorMessage('PHP CS Fixer: Configuration error of the application.');
                    break;
                case 32:
                    vscode.window.showErrorMessage('PHP CS Fixer: Configuration error of a Fixer.');
                    break;
                default:
                    vscode.window.showErrorMessage('PHP CS Fixer unknown error.');
                    break;
            }

            console.log(stderr);

            try{
                fs.unlink(fileName);
            }catch(err){}
        });
    };

    PHPCSFixer.prototype.fix = function(document){
        var lastLine = document.lineAt(document.lineCount - 1);
        var endOfLastLine = lastLine.range.end;
        var documentEndPosition = new vscode.Position(endOfLastLine.line, endOfLastLine.character);
        var editRange = new vscode.Range(new vscode.Position(0, 0), documentEndPosition);

        this.fixIt(document, document.getText(), editRange, false);
    };

    PHPCSFixer.prototype.autoFix = function(document){
        var that = this;
        var editor = vscode.window.activeTextEditor;
        var selection = editor.selection;
        var offsetEnd = document.offsetAt(selection.start);
        vscode.commands.executeCommand("editor.action.jumpToBracket").then(function(){
            selection = editor.selection;
            var offsetStart = document.offsetAt(selection.start);
            if(offsetEnd != offsetStart){
                var indent = document.lineAt(document.positionAt(offsetStart)).text.match(/^(\s*)\S+/)[1];
                // editor.selection = new vscode.Selection(document.positionAt(offsetStart), document.positionAt(offsetEnd-1));
                var range = new vscode.Range(document.positionAt(offsetStart), document.positionAt(offsetEnd-1));
                var text = "<?php\n" + indent + "if(1){" + document.getText(range) + "}";
                that.fixIt(document, text, range, true);
                vscode.commands.executeCommand("editor.action.jumpToBracket");
            }else{
                console.log("no match bracket");
            }
        });
    };

    return PHPCSFixer;
}());
function activate(context) {
    var phpcsfixer = new PHPCSFixer();
    phpcsfixer.activate(context);
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map