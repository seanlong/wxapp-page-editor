(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.wxmlparser = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({"/work/wxapp/wxml-parser/dom_parser.js":[function(require,module,exports){
"use strict";

/*
 * DOMParser HTML extension
 * 2012-09-04
 * 
 * By Eli Grey, http://eligrey.com
 * Public domain.
 * NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.
 */

/*! @source https://gist.github.com/1129031 */
/*global document, DOMParser*/

(function (DOMParser) {
  "use strict";

  var DOMParser_proto = DOMParser.prototype,
      real_parseFromString = DOMParser_proto.parseFromString;

  // Firefox/Opera/IE throw errors on unsupported types
  try {
    // WebKit returns null on unsupported types
    if (new DOMParser().parseFromString("", "text/html")) {
      // text/html parsing is natively supported
      return;
    }
  } catch (ex) {}

  DOMParser_proto.parseFromString = function (markup, type) {
    if (/^\s*text\/html\s*(?:;|$)/i.test(type)) {
      var doc = document.implementation.createHTMLDocument("");
      if (markup.toLowerCase().indexOf('<!doctype') > -1) {
        doc.documentElement.innerHTML = markup;
      } else {
        doc.body.innerHTML = markup;
      }
      return doc;
    } else {
      return real_parseFromString.apply(this, arguments);
    }
  };
})(DOMParser);

},{}],"/work/wxapp/wxml-parser/index.js":[function(require,module,exports){
'use strict';

require('./dom_parser.js');

function XML2DataTree(root, context, newRoot, layerOps, layerIdx) {
	if (!newRoot) newRoot = { tag: 'body', children: [] };else if (!newRoot.children) throw new Error('cannot add child to leaf node');

	if (!root.attributes && root.nodeType == 3) {
		var newNode = parseTextNode(root, context);
	} else {
		var newNode = parseElementNode(root, context, layerOps, layerIdx);
	}
	if (newNode == null) return;

	if (newNode.tag !== 'wx-block') {
		if (newNode.items && newNode.array && newNode.array.length) newNode.array.forEach(function (n) {
			return newRoot.children.push(n);
		});else newRoot.children.push(newNode);
	}
	var newLayerOps = [];
	var newLayerIdx = 0;

	if (newNode.items && newNode.array && newNode.array.length) {
		newNode.array.forEach(function (n, idx) {
			n = n.tag === 'wx-block' ? newRoot : n;
			var newContext = JSON.parse(JSON.stringify(context));
			newContext[newNode.itemName] = newNode.items[idx];
			newContext[newNode.indexName] = idx;
			for (var i = 0; i < root.childNodes.length; ++i) {
				var child = root.childNodes[i];
				if (child.nodeType != 1 && child.nodeType != 3) continue;
				if (child.nodeType == 3 && !child.nodeValue.trim().length) continue;
				XML2DataTree(child, newContext, n, newLayerOps, newLayerIdx++);
			}
		});
	} else {
		newNode = newNode.tag === 'wx-block' ? newRoot : newNode;
		for (var i = 0; i < root.childNodes.length; ++i) {
			var child = root.childNodes[i];
			if (child.nodeType != 1 && child.nodeType != 3) continue;
			if (child.nodeType == 3 && !child.nodeValue.trim().length) continue;
			XML2DataTree(child, context, newNode, newLayerOps, newLayerIdx++);
		}
	}

	return newRoot;
}

function parseTextNode(node, data) {
	return stringEvaluate(node.nodeValue.trim(), data, false);
}

function parseElementNode(node, data, layerOps, layerIdx) {
	var ret = {};
	ret.tag = 'wx-' + (node.tagName == 'IMG' ? 'image' : node.tagName.toLowerCase());
	ret.attr = {};
	ret.children = [];
	for (var i = 0; i < node.attributes.length; ++i) {
		var attr = node.attributes[i];
		var value = stringEvaluate(attr.value.trim(), data, attr.name === 'data');
		var name = attr.name;
		if (name.split('-').length > 1) name = name.split('-').map(function (p, i) {
			return i != 0 ? p[0].toUpperCase() + p.substring(1) : p;
		}).join('');
		if (ret.items && ret.array) {
			ret.array.forEach(function (c) {
				return c.attr[name] = value;
			});
		} else {
			ret.attr[name] = value;
		}
		//if (name.startsWith('wx:')) {
		if (name.substring(0, 3) === 'wx:') {
			ret = processWxAttribute(name, value, ret, layerOps, layerIdx);
			if (!ret) break;
		}
	}
	return ret;
}

function processWxAttribute(name, value, node, operations, idx) {
	switch (name) {
		case 'wx:if':
			var condition = !!value;
			operations[idx] = ['if', condition];
			if (condition == false) return;
			break;
		case 'wx:elif':
			var condition = !!value;
			operations[idx] = ['elif', condition];
			if (operations[idx - 1] == undefined || operations[idx - 1][0] != 'if') throw new Error('no corresponding wx:if found');
			if (operations[idx - 1][1] == true || condition == false) return;
			break;
		case 'wx:else':
			if (operations[idx - 1] == undefined || operations[idx - 1][0] != 'if' && operations[idx - 1][0] != 'elif') throw new Error('no corresponding wx:if/elif found');
			if (operations[idx - 1][1] == true || operations[idx - 1][0] == 'elif' && operations[idx - 2][1] == true) return;
			break;
		case 'wx:for':
			var items = Array.isArray(value) ? value : [];
			delete node.attr[name];
			node = {
				tag: node.tag,
				indexName: node.indexName ? node.indexName : 'index',
				itemName: node.itemName ? node.itemName : 'item',
				items: items,
				array: items.map(function (i) {
					return { tag: node.tag, attr: node.attr, children: [] };
				})
			};
			break;
		case 'wx:forIndex':
			node.indexName = value;
			if (node.items && node.array) node.array.forEach(function (c) {
				return delete c.attr[name];
			});else if (node.attr) node.attr[name];
			break;
		case 'wx:forItem':
			node.itemName = value;
			if (node.items && node.array) node.array.forEach(function (c) {
				return delete c.attr[name];
			});else if (node.attr) node.attr[name];
			break;
	}
	return node;
}

function stringEvaluate(str, data, toObject) {
	if (str.match(/^{{[^{}]+}}$/)) {
		return mustacheEvaluate(str.replace(/^{{/, '').replace(/}}$/, ''), data, toObject);
	} else {
		return str.replace(/({{[^{}]+}})/g, function (v) {
			return mustacheEvaluate(v.replace(/^{{/, '').replace(/}}$/, ''), data, toObject);
		});
	}
}

function mustacheEvaluate(str, data, toObject) {
	var s = '(function() { ';
	for (var k in data) {
		s += 'var ' + k + ' = JSON.parse(\'' + JSON.stringify(data[k]) + '\');';
	}
	s += 'return ';
	var exp = toObject ? s + '{' + str + '}})()' : s + str + '})()';
	try {
		var ret = eval(exp);
	} catch (e) {
		console.log(exp);
		console.error(e);
	}
	return ret;
}

function parser(input, data) {
	var doc = new DOMParser().parseFromString(input, 'text/html');
	var tree = XML2DataTree(doc.body, data, null, []);
	return tree.children[0];
}

module.exports = parser;

},{"./dom_parser.js":"/work/wxapp/wxml-parser/dom_parser.js"}]},{},["/work/wxapp/wxml-parser/index.js"])("/work/wxapp/wxml-parser/index.js")
});


//# sourceMappingURL=wxml-parser.js.map
