import type { Env } from './env.ts'
import { failure, json, readJsonBody } from './http.ts'

/**
 * The one-person control room for the site: totals, per-page stats, the guestbook
 * and the links wall. It is a plain HTML console served straight from the Worker,
 * and every /api/admin route behind it needs `Authorization: Bearer <ADMIN_TOKEN>`.
 */

const MAX_ADMIN_BODY_BYTES = 1024
const LIST_LIMIT = 200
const ALLOWED_LINK_STATUS = ['pending', 'approved', 'rejected'] as const

const TOTAL_SELECT = `SELECT COALESCE(SUM(views), 0) AS views, COALESCE(SUM(likes), 0) AS likes, COUNT(*) AS pages
FROM page_stats`
const PAGES_SELECT = `SELECT path, views, likes, updated_at FROM page_stats
ORDER BY views DESC, likes DESC, path ASC LIMIT ?1`
const GUESTBOOK_COUNT_SELECT = 'SELECT COUNT(*) AS total FROM guestbook_messages'
const GUESTBOOK_SELECT = `SELECT m.id, m.parent_id, m.body, m.created_at, COUNT(l.actor_id) AS likes
FROM guestbook_messages m
LEFT JOIN guestbook_likes l ON l.message_id = m.id
GROUP BY m.id
ORDER BY m.id DESC LIMIT ?1`
const LINKS_COUNT_SELECT = 'SELECT COUNT(*) AS total FROM link_submissions'
const LINKS_PENDING_SELECT = `SELECT COUNT(*) AS total FROM link_submissions WHERE status = 'pending'`
const LINKS_SELECT = `SELECT id, url, domain, name, description, icon, status, created_at FROM link_submissions
ORDER BY id DESC LIMIT ?1`

// A message is removed together with its replies and every like attached to either.
const REPLY_LIKE_DELETE = `DELETE FROM guestbook_likes
WHERE message_id IN (SELECT id FROM guestbook_messages WHERE parent_id = ?1)`
const REPLY_DELETE = 'DELETE FROM guestbook_messages WHERE parent_id = ?1'
const MESSAGE_LIKE_DELETE = 'DELETE FROM guestbook_likes WHERE message_id = ?1'
const MESSAGE_DELETE = 'DELETE FROM guestbook_messages WHERE id = ?1'

const LINK_STATUS_UPDATE = 'UPDATE link_submissions SET status = ?1 WHERE id = ?2'
const LINK_DELETE = 'DELETE FROM link_submissions WHERE id = ?1'

type CountRow = { total: number }

export function adminPage(): Response {
	return new Response(ADMIN_HTML, {
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'no-store',
		},
	})
}

export async function handleAdmin(
	request: Request,
	env: Env,
	pathname: string,
): Promise<Response> {
	if (!(await isAuthorized(request, env))) {
		return failure(401, 'unauthorized', 'a valid admin token is required', {
			'www-authenticate': 'Bearer',
		})
	}

	if (pathname === '/api/admin/overview') {
		if (request.method !== 'GET') return methodNotAllowed('GET')
		return json(await readOverview(env))
	}
	if (pathname === '/api/admin/pages') {
		if (request.method !== 'GET') return methodNotAllowed('GET')
		return json(await readPages(env))
	}
	if (pathname === '/api/admin/guestbook') {
		if (request.method !== 'GET') return methodNotAllowed('GET')
		return json(await readGuestbook(env))
	}
	if (pathname === '/api/admin/links') {
		if (request.method !== 'GET') return methodNotAllowed('GET')
		return json(await readLinks(env))
	}
	if (pathname === '/api/admin/guestbook/delete') {
		if (request.method !== 'POST') return methodNotAllowed('POST')
		return deleteGuestbookMessage(request, env)
	}
	if (pathname === '/api/admin/links/status') {
		if (request.method !== 'POST') return methodNotAllowed('POST')
		return setLinkStatus(request, env)
	}
	if (pathname === '/api/admin/links/delete') {
		if (request.method !== 'POST') return methodNotAllowed('POST')
		return deleteLink(request, env)
	}
	return failure(404, 'not_found', 'unknown admin route')
}

function methodNotAllowed(allow: string): Response {
	return failure(405, 'method_not_allowed', `use ${allow} on this admin route`, { allow })
}

async function readOverview(env: Env): Promise<Record<string, number>> {
	const [totals, guests, links, pending] = await Promise.all([
		env.STATS_DB.prepare(TOTAL_SELECT).first<{ views: number | null, likes: number | null, pages: number | null }>(),
		env.STATS_DB.prepare(GUESTBOOK_COUNT_SELECT).first<CountRow>(),
		env.STATS_DB.prepare(LINKS_COUNT_SELECT).first<CountRow>(),
		env.STATS_DB.prepare(LINKS_PENDING_SELECT).first<CountRow>(),
	])
	return {
		views: totals?.views ?? 0,
		likes: totals?.likes ?? 0,
		pages: totals?.pages ?? 0,
		guestbook: guests?.total ?? 0,
		links: links?.total ?? 0,
		pendingLinks: pending?.total ?? 0,
	}
}

async function readPages(env: Env): Promise<unknown> {
	const rows = await env.STATS_DB.prepare(PAGES_SELECT).bind(LIST_LIMIT).all<{
		path: string
		views: number
		likes: number
		updated_at: string
	}>()
	return { pages: rows.results }
}

async function readGuestbook(env: Env): Promise<unknown> {
	const rows = await env.STATS_DB.prepare(GUESTBOOK_SELECT).bind(LIST_LIMIT).all<{
		id: number
		parent_id: number | null
		body: string
		created_at: string
		likes: number
	}>()
	return { messages: rows.results }
}

async function readLinks(env: Env): Promise<unknown> {
	const rows = await env.STATS_DB.prepare(LINKS_SELECT).bind(LIST_LIMIT).all()
	return { links: rows.results }
}

async function deleteGuestbookMessage(request: Request, env: Env): Promise<Response> {
	const id = await readId(request)
	if (id === null) return failure(400, 'invalid_body', 'id must be a positive integer')
	await env.STATS_DB.batch([
		env.STATS_DB.prepare(REPLY_LIKE_DELETE).bind(id),
		env.STATS_DB.prepare(REPLY_DELETE).bind(id),
		env.STATS_DB.prepare(MESSAGE_LIKE_DELETE).bind(id),
		env.STATS_DB.prepare(MESSAGE_DELETE).bind(id),
	])
	return json({ ok: true, id })
}

async function setLinkStatus(request: Request, env: Env): Promise<Response> {
	const payload = await readObject(request)
	if (payload === null) return failure(400, 'invalid_body', 'body must be a JSON object')
	const id = positiveInteger(payload.id)
	const status = payload.status
	if (id === null) return failure(400, 'invalid_body', 'id must be a positive integer')
	if (typeof status !== 'string' || !(ALLOWED_LINK_STATUS as readonly string[]).includes(status)) {
		return failure(400, 'invalid_body', `status must be one of ${ALLOWED_LINK_STATUS.join(', ')}`)
	}
	await env.STATS_DB.prepare(LINK_STATUS_UPDATE).bind(status, id).run()
	return json({ ok: true, id, status })
}

async function deleteLink(request: Request, env: Env): Promise<Response> {
	const id = await readId(request)
	if (id === null) return failure(400, 'invalid_body', 'id must be a positive integer')
	await env.STATS_DB.prepare(LINK_DELETE).bind(id).run()
	return json({ ok: true, id })
}

async function readId(request: Request): Promise<number | null> {
	const payload = await readObject(request)
	return payload === null ? null : positiveInteger(payload.id)
}

async function readObject(request: Request): Promise<Record<string, unknown> | null> {
	try {
		const value = await readJsonBody(request, MAX_ADMIN_BODY_BYTES)
		if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
		return value as Record<string, unknown>
	} catch {
		return null
	}
}

function positiveInteger(value: unknown): number | null {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

async function isAuthorized(request: Request, env: Env): Promise<boolean> {
	const expected = env.ADMIN_TOKEN
	if (expected === undefined || expected === '') return false
	const header = request.headers.get('authorization')
	if (header === null || !header.startsWith('Bearer ')) return false
	return sameSecret(header.slice('Bearer '.length), expected)
}

/** Compares the two secrets through their digests so the check does not leak length. */
async function sameSecret(a: string, b: string): Promise<boolean> {
	const encoder = new TextEncoder()
	const [digestA, digestB] = await Promise.all([
		crypto.subtle.digest('SHA-256', encoder.encode(a)),
		crypto.subtle.digest('SHA-256', encoder.encode(b)),
	])
	const bytesA = new Uint8Array(digestA)
	const bytesB = new Uint8Array(digestB)
	let diff = 0
	for (let i = 0; i < bytesA.length; i += 1) diff |= bytesA[i] ^ bytesB[i]
	return diff === 0
}

const ADMIN_HTML = [
	'<!doctype html>',
	'<html lang="zh-CN"><head><meta charset="utf-8">',
	'<meta name="viewport" content="width=device-width, initial-scale=1">',
	'<meta name="robots" content="noindex">',
	'<title>hydblog 后台</title>',
	'<style>',
	':root{color-scheme:dark}',
	'*{box-sizing:border-box}',
	'body{margin:0;background:#06131f;color:#d7e6f2;font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}',
	'header{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:14px 18px;border-bottom:1px solid #12324a}',
	'h1{font-size:15px;margin:0 12px 0 0;color:#6fe3d2}',
	'input,button,select{font:inherit;background:#0b2136;color:#d7e6f2;border:1px solid #1c4666;border-radius:6px;padding:6px 10px}',
	'button{cursor:pointer}button:hover{border-color:#3ba9d6}',
	'#token{width:220px}',
	'nav{display:flex;gap:6px;padding:12px 18px 0}',
	'nav button{background:transparent;border-color:#16374f}',
	'nav button[aria-selected="true"]{background:#0e2c44;border-color:#3ba9d6;color:#6fe3d2}',
	'main{padding:16px 18px 60px}',
	'#status{color:#7f9bb3;font-size:12px;margin-left:auto}',
	'.cards{display:flex;flex-wrap:wrap;gap:12px}',
	'.card{min-width:130px;background:#0a2033;border:1px solid #12324a;border-radius:10px;padding:12px 16px}',
	'.card b{display:block;font-size:24px;color:#6fe3d2}',
	'.card span{font-size:12px;color:#7f9bb3}',
	'table{border-collapse:collapse;width:100%;margin-top:14px}',
	'th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #0f2c42;vertical-align:top}',
	'th{color:#7f9bb3;font-weight:normal;position:sticky;top:0;background:#06131f}',
	'td.num{text-align:right;font-variant-numeric:tabular-nums}',
	'td.actions{white-space:nowrap}',
	'td.actions button{padding:3px 8px;font-size:12px;margin-right:4px}',
	'.tag{font-size:11px;padding:1px 7px;border-radius:99px;border:1px solid #2a5a7d;color:#8fd0e8}',
	'.tag.approved{color:#7ee0a8;border-color:#2f7a52}',
	'.tag.rejected{color:#e88f8f;border-color:#7a3a3a}',
	'.muted{color:#6b8399;font-size:12px}',
	'.empty{color:#6b8399;padding:20px 0}',
	'</style></head><body>',
	'<header>',
	'<h1>hydblog 后台</h1>',
	'<input id="token" type="password" placeholder="后台口令" autocomplete="current-password">',
	'<button id="save">保存口令</button>',
	'<button id="reload">刷新</button>',
	'<span id="status"></span>',
	'</header>',
	'<nav id="tabs"></nav>',
	'<main><div id="panel"><p class="empty">输入口令后点“保存口令”。</p></div></main>',
	'<script>',
	'var TABS=[["overview","总览"],["pages","页面"],["guestbook","留言"],["links","友链"]];',
	'var TOKEN_KEY="hydblog_admin_token";',
	'var token=localStorage.getItem(TOKEN_KEY)||"";',
	'var current="overview";',
	'var tabsEl=document.getElementById("tabs");',
	'var panel=document.getElementById("panel");',
	'var statusEl=document.getElementById("status");',
	'var tokenInput=document.getElementById("token");',
	'tokenInput.value=token;',
	'function setStatus(t){statusEl.textContent=t||""}',
	'function api(path,options){',
	'  return fetch(path,Object.assign({},options,{headers:Object.assign({"authorization":"Bearer "+token},(options&&options.headers)||{})}))',
	'    .then(function(r){if(!r.ok){return r.json().catch(function(){return{}}).then(function(b){throw new Error((b.error&&b.error.message)||("HTTP "+r.status))})}return r.json()});',
	'}',
	'function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n}',
	'function clear(node){while(node.firstChild)node.removeChild(node.firstChild)}',
	'function buildTabs(){',
	'  clear(tabsEl);',
	'  TABS.forEach(function(t){',
	'    var b=el("button",null,t[1]);',
	'    b.setAttribute("aria-selected",String(t[0]===current));',
	'    b.onclick=function(){current=t[0];render()};',
	'    tabsEl.appendChild(b);',
	'  });',
	'}',
	'function render(){',
	'  buildTabs();',
	'  clear(panel);',
	'  if(!token){panel.appendChild(el("p","empty","输入口令后点“保存口令”。"));return}',
	'  setStatus("加载中…");',
	'  var task=current==="overview"?loadOverview:current==="pages"?loadPages:current==="guestbook"?loadGuestbook:loadLinks;',
	'  task().then(function(){setStatus("")}).catch(function(e){setStatus("出错："+e.message)});',
	'}',
	'function loadOverview(){',
	'  return api("/api/admin/overview").then(function(d){',
	'    var cards=el("div","cards");',
	'    [["总浏览",d.views],["总点赞",d.likes],["页面数",d.pages],["留言数",d.guestbook],["友链提交",d.links],["待处理友链",d.pendingLinks]].forEach(function(c){',
	'      var box=el("div","card");box.appendChild(el("b",null,String(c[1])));box.appendChild(el("span",null,c[0]));cards.appendChild(box);',
	'    });',
	'    panel.appendChild(cards);',
	'  });',
	'}',
	'function table(headers,rows){',
	'  var t=el("table");var thead=el("thead");var tr=el("tr");',
	'  headers.forEach(function(h){tr.appendChild(el("th",null,h))});thead.appendChild(tr);t.appendChild(thead);',
	'  var tb=el("tbody");rows.forEach(function(cells){var r=el("tr");cells.forEach(function(c){r.appendChild(c)});tb.appendChild(r)});',
	'  t.appendChild(tb);return t;',
	'}',
	'function loadPages(){',
	'  return api("/api/admin/pages").then(function(d){',
	'    if(!d.pages.length){panel.appendChild(el("p","empty","还没有页面数据。"));return}',
	'    var rows=d.pages.map(function(p){',
	'      var path=el("td");path.appendChild(el("span",null,p.path));',
	'      return [path,el("td","num",String(p.views)),el("td","num",String(p.likes)),el("td","muted",p.updated_at)];',
	'    });',
	'    panel.appendChild(table(["路径","浏览","点赞","最后更新"],rows));',
	'  });',
	'}',
	'function loadGuestbook(){',
	'  return api("/api/admin/guestbook").then(function(d){',
	'    if(!d.messages.length){panel.appendChild(el("p","empty","还没有留言。"));return}',
	'    var rows=d.messages.map(function(m){',
	'      var body=el("td",null,m.body+(m.parent_id?" ↳回复#"+m.parent_id:""));',
	'      var act=el("td","actions");',
	'      var del=el("button",null,"删除");',
	'      del.onclick=function(){if(confirm("删除留言 #"+m.id+"（含回复）？")){del.disabled=true;api("/api/admin/guestbook/delete",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:m.id})}).then(render).catch(function(e){del.disabled=false;setStatus("出错："+e.message)})}};',
	'      act.appendChild(del);',
	'      return [el("td","num",String(m.id)),body,el("td","num",String(m.likes)),el("td","muted",m.created_at),act];',
	'    });',
	'    panel.appendChild(table(["ID","内容","赞","时间","操作"],rows));',
	'  });',
	'}',
	'function loadLinks(){',
	'  return api("/api/admin/links").then(function(d){',
	'    if(!d.links.length){panel.appendChild(el("p","empty","还没有友链提交。"));return}',
	'    var rows=d.links.map(function(l){',
	'      var name=el("td");var a=el("a",null,l.name);a.href=l.url;a.target="_blank";a.rel="noreferrer";a.style.color="#8fd0e8";name.appendChild(a);name.appendChild(el("div","muted",l.domain));',
	'      var tag=el("span","tag "+l.status,l.status);var st=el("td");st.appendChild(tag);',
	'      var act=el("td","actions");',
	'      var sel=el("select");["pending","approved","rejected"].forEach(function(s){var o=el("option",null,s);o.value=s;if(s===l.status)o.selected=true;sel.appendChild(o)});',
	'      sel.onchange=function(){api("/api/admin/links/status",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:l.id,status:sel.value})}).then(function(){setStatus("已更新 #"+l.id)}).catch(function(e){setStatus("出错："+e.message)})};',
	'      var del=el("button",null,"删除");',
	'      del.onclick=function(){if(confirm("删除友链 "+l.name+"？")){api("/api/admin/links/delete",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:l.id})}).then(render).catch(function(e){setStatus("出错："+e.message)})}};',
	'      act.appendChild(sel);act.appendChild(del);',
	'      return [el("td","num",String(l.id)),name,st,el("td","muted",l.created_at),act];',
	'    });',
	'    panel.appendChild(table(["ID","站点","状态","时间","操作"],rows));',
	'  });',
	'}',
	'document.getElementById("save").onclick=function(){token=tokenInput.value.trim();localStorage.setItem(TOKEN_KEY,token);render()};',
	'document.getElementById("reload").onclick=render;',
	'render();',
	'</script></body></html>',
].join('\n')
