const vscode = acquireVsCodeApi();

let requests = [];
const selected = new Set();

const $ = (id) => document.getElementById(id);

function decide(ids, decision) {
  if (ids.length === 0) return;
  ids.forEach((id) => selected.delete(id));
  vscode.postMessage({ type: 'decide', ids, decision });
}

$('allowAll').addEventListener('click', () => decide(requests.map((r) => r.id), 'allow'));
$('denyAll').addEventListener('click', () => decide(requests.map((r) => r.id), 'deny'));
$('allowSelected').addEventListener('click', () => decide([...selected], 'allow'));
$('denySelected').addEventListener('click', () => decide([...selected], 'deny'));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render() {
  const list = $('list');
  list.replaceChildren();

  for (const id of [...selected]) {
    if (!requests.some((r) => r.id === id)) selected.delete(id);
  }

  $('allowAll').disabled = $('denyAll').disabled = requests.length === 0;
  $('allowSelected').disabled = $('denySelected').disabled = selected.size === 0;

  if (requests.length === 0) {
    list.appendChild(el('div', 'empty', '대기 중인 허가 요청이 없어요'));
    return;
  }

  for (const req of requests) {
    const item = el('div', 'item');

    const box = el('input');
    box.type = 'checkbox';
    box.checked = selected.has(req.id);
    box.addEventListener('change', () => {
      box.checked ? selected.add(req.id) : selected.delete(req.id);
      render();
    });

    const info = el('div', 'info');
    info.appendChild(el('div', 'tool', req.toolName));
    info.appendChild(el('div', 'summary', req.summary));
    if (req.cwd) info.appendChild(el('div', 'cwd', req.cwd));

    const actions = el('div', 'actions');
    const allow = el('button', 'btn primary small', '허용');
    allow.addEventListener('click', () => decide([req.id], 'allow'));
    const deny = el('button', 'btn danger small', '거부');
    deny.addEventListener('click', () => decide([req.id], 'deny'));
    actions.append(allow, deny);

    item.append(box, info, actions);
    list.appendChild(item);
  }
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg?.type !== 'requests') return;
  requests = msg.requests || [];
  $('offline').hidden = msg.listening;
  render();
});

vscode.postMessage({ type: 'ready' });
