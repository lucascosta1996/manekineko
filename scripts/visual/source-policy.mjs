import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import postcss from 'postcss';

const roots = ['apps/landing-page/app', 'apps/landing-page/components', 'apps/web/app', 'apps/web/components', 'apps/launch/app', 'apps/launch/components', 'packages/ui/src'];
const ownedClass = /\.ui-(?:button(?:-[\w-]+)?|icon-button|text-action(?:-[\w-]+)?|input|textarea|select(?:-[\w-]+)?|checkbox|radio|switch|check-field|field(?:-[\w-]+)?|disclosure(?:-[\w-]+)?|card-action|tab|segment)(?![\w-])/;
const ownedProperty = /^(?:font(?:-.*)?|padding(?:-.*)?|border(?:-.*)?|color|background(?:-.*)?|(?:row-|column-)?gap|line-height|letter-spacing|text-transform|text-decoration(?:-.*)?|(?:min-|max-)?(?:height|block-size)|min-(?:width|inline-size)|appearance|cursor|box-shadow|outline(?:-.*)?|transition(?:-.*)?)$/;

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
function attribute(node, name) {
  return node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText() === name);
}
function value(node, name) {
  const initializer = attribute(node, name)?.initializer;
  if (!initializer) return undefined;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    const expression = initializer.expression;
    if (ts.isStringLiteral(expression) || ts.isNumericLiteral(expression)) return expression.text;
    if (expression.kind === ts.SyntaxKind.TrueKeyword) return 'true';
    if (expression.kind === ts.SyntaxKind.FalseKeyword) return 'false';
    if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(expression.operand)) return `-${expression.operand.text}`;
  }
  return undefined;
}
function classes(node) {
  const initializer = attribute(node, 'className')?.initializer;
  const tokens = text => new Set(text.split(/\s+/).filter(token => token && !token.includes('\0')));
  function knownText(expression) {
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
    if (ts.isTemplateExpression(expression)) return expression.head.text + expression.templateSpans.map(span => '\0' + span.literal.text).join('');
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) return knownText(expression.left) + knownText(expression.right);
    return '\0';
  }
  function guaranteed(expression) {
    if (ts.isConditionalExpression(expression)) {
      const yes = guaranteed(expression.whenTrue), no = guaranteed(expression.whenFalse);
      return new Set([...yes].filter(token => no.has(token)));
    }
    return tokens(knownText(expression));
  }
  if (!initializer) return new Set();
  return ts.isJsxExpression(initializer) ? initializer.expression ? guaranteed(initializer.expression) : new Set() : guaranteed(initializer);
}
function ancestors(node) {
  const elements = [];
  for (let parent = ts.isJsxSelfClosingElement(node) ? node.parent : node.parent?.parent; parent; parent = parent.parent) {
    if (ts.isJsxElement(parent)) elements.push(parent.openingElement);
  }
  return elements;
}
// Keep combinators inside :is(), :where() and attribute values intact. Ownership
// follows the rule's subject, not an unrelated shared ancestor or sibling.
function subject(selector) {
  let depth = 0, quote = '', start = 0;
  for (let index = 0; index < selector.length; index++) {
    const character = selector[index];
    if (character === '\\') { index++; continue; }
    if (quote) { if (character === quote) quote = ''; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '(' || character === '[') depth++;
    else if (character === ')' || character === ']') depth--;
    else if (depth === 0 && /[\s>+~]/.test(character)) start = index + 1;
  }
  return selector.slice(start);
}

/** Structural checks are deliberately conservative: dynamic contracts belong in shared primitives. */
export function inspectSource(file, text) {
  const errors = [];
  const report = (line, rule) => errors.push(`${file}:${line}: ${rule}`);
  const application = !file.startsWith('packages/');
  if (/\.tsx?$/.test(file)) {
    const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
      if (ts.isCallExpression(node) && /^(?:(?:window|globalThis)\.)?(alert|confirm|prompt)$/.test(node.expression.getText(tree)) && !(node.expression.getText(tree) === 'confirm' && /const\s+confirm\s*=\s*useConfirm\(\)/.test(text))) report(line, 'VI-05 app-owned native dialog; use shared confirmation');
      if (application && (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))) {
        const tag = node.tagName.getText(tree), contract = classes(node), parents = ancestors(node);
        if (tag === 'button' && !['ui-card-action', 'ui-tab', 'ui-segment'].some(name => contract.has(name))) report(line, 'VI-02 raw button outside a documented shared contract');
        if (tag === 'select') report(line, 'VI-05 native select; use shared Select');
        if (tag === 'textarea' && !contract.has('ui-textarea')) report(line, 'VI-02 textarea requires ui-textarea or the shared Textarea component');
        if (tag === 'input') {
          const type = value(node, 'type') ?? 'text';
          // Hidden transport fields and deliberately inert, unfocusable honeypots
          // are not rendered interactive controls. A Field label alone is not styling.
          const hidden = type === 'hidden' || (value(node, 'tabIndex') === '-1' && parents.some(parent => {
            const inert = attribute(parent, 'inert');
            return inert && (!inert.initializer || value(parent, 'inert') === 'true') && value(parent, 'aria-hidden') === 'true';
          }));
          if (!hidden) {
            if (type === 'checkbox' || type === 'radio') {
              const expected = type === 'radio' ? ['ui-radio'] : ['ui-checkbox', 'ui-switch'];
              if (!expected.some(name => contract.has(name)) || !parents.some(parent => parent.tagName.getText(tree) === 'label' && classes(parent).has('ui-check-field'))) report(line, 'VI-02 choice input requires its shared class and ui-check-field label target');
            } else if (['button', 'submit', 'reset', 'image', 'range'].includes(type)) report(line, 'VI-02 this input type needs a documented shared primitive');
            else if (!contract.has('ui-input')) report(line, 'VI-02 input requires ui-input or the shared Input component');
          }
        }
        if (tag === 'summary' && !(parents[0]?.tagName.getText(tree) === 'details' && classes(parents[0]).has('ui-disclosure'))) report(line, 'VI-02 summary requires its direct details.ui-disclosure contract');
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  if (file.endsWith('.css')) {
    const tree = postcss.parse(text, { from: file });
    tree.walkRules(rule => {
      if (/\[class\s*[*^$]=/.test(rule.selector)) report(rule.source.start.line, 'VI-02 class-name substring styling');
      const owned = rule.selectors.some(selector => ownedClass.test(subject(selector)) || (/^summary(?:\W|$)/.test(subject(selector)) && /\.ui-disclosure(?:[^\w-]|$)/.test(selector)));
      rule.walkDecls(decl => {
        if (decl.important) report(decl.source.start.line, 'VI-02 important cascade override');
        if (application && decl.prop.startsWith('--ui-')) report(decl.source.start.line, 'VI-02 shared tokens are authored only in packages/ui');
        if (application && owned && ownedProperty.test(decl.prop)) report(decl.source.start.line, 'VI-03 app overrides shared control internals');
      });
    });
  }
  return errors;
}

export function inspectWorkspace() {
  const errors = roots.flatMap(files).flatMap(file => inspectSource(file, fs.readFileSync(file, 'utf8')));
  const inventory = JSON.parse(fs.readFileSync('tests/visual/route-inventory.json', 'utf8'));
  for (const [app, folder] of [['landing', 'landing-page'], ['web', 'web'], ['launch', 'launch']]) {
    const base = `apps/${folder}/app`;
    const actual = files(base).filter(file => file.endsWith('/page.tsx')).map(file => '/' + path.relative(base, path.dirname(file)).replaceAll(path.sep, '/')).map(route => route === '/.' ? '/' : route).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...inventory[app].routes].sort())) errors.push(`${base}:1: VI-13 route inventory drift: actual ${actual.join(', ')}`);
  }
  return errors;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = inspectWorkspace();
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Visual source contracts passed: JSX semantics, native dialogs, CSS ownership and cascade.');
}
