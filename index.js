var names = ["javascript", "html", "css"];
var editors = names.map(n => {
    var editor = ace.edit(n);
    editor.getSession().setUseWrapMode(true);
    //editor.renderer.setShowGutter(false);
    editor.getSession().setUseWorker(false);
    editor.setTheme("ace/theme/chrome");
    editor.setShowPrintMargin(false);
    editor.setHighlightActiveLine(false);
    editor.getSession().setMode("ace/mode/" + n);
    return editor;
});

editors[0].setValue(`
Page({
    data: {
        msg: 'Hello World'
    }
})
`);

editors[1].setValue(`
<page>
    <view class="hello">
        {{msg}}
    </view>
</page>
`);

editors[2].setValue(`
.hello {
    color: red;
}
`)

function handleReload() {
    var javascript = editors[0].getValue();
    var html = editors[1].getValue();
    var css = editors[2].getValue();
    var content = `
        <head>
          <meta charset="UTF-8"/>
          <meta name="viewport" content="width=device-width, user-scalable=no, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0"/>
        </head>
        <body>
        <div id="app"></div>
        <script src="./wxml-parser.js"></script>
        <script src="./split/virtual_dom.js"></script>
        <script src="./split/report.js"></script>
        <script src="./split/exparser.js"></script>
        <script src="./split/exparser-behavior.js"></script>
        <script src="./split/wx.js"></script>
        <script src="./split/mobile.js"></script>
        <script>
            function Page(obj) {
                obj.render = function() {
                    var tree = wxmlparser(input, this.data);
                    console.log(tree);
                    document.dispatchEvent(new CustomEvent("generateFuncReady", {
                        detail: {
                            template: tree
                        }
                    }))
                }
                obj.setData = function(newData) {
                    Object.assign(this.data, newData);
                    this.render();
                }
                return obj;
            }
        </script>
    `;
    content += '<style>' + css + '<\/style><script>';
    content += `
        var page = ` + javascript + `;
        var input = '` + html.replace(/[\r\n]+/g, '').replace(/\'/g, "\\'") + `';
        window.addEventListener('wx-event', e => {
          var data = e.detail[1].data;
          if (data && data.eventName && page[data.eventName])
            page[data.eventName](data.data);
        })
        window.firstRender = true;
        if (page['onLoad']) {
            page['onLoad']()
        } else {  
            page.render();
        }
        <\/script><\/body>
    `
    var doc = document.querySelector('iframe').contentDocument;
    doc.open();
    doc.write(content);
    doc.close();
}