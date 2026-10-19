// ─── Archive of Our Own (AO3) — Cinder Extension ─────────────────────
//
// Search AO3 and download works as AO3's own EPUB (or AZW3/MOBI/PDF/HTML).
//
//   • Search by keywords, or paste a work URL / work ID to jump straight to it
//   • Discover shelves (recently updated, most kudos, completed favourites,
//     most bookmarked), optionally narrowed to your favourite fandoms
//   • Filters in settings: sort order, language, complete-only, hide Explicit
//   • Optional AO3 session cookie for members-only ("locked") works
//
// AO3 is run by volunteers on donated servers. This extension only makes
// one request per search page / per download, and backs off on HTTP 429.

var AO3Source = {};

AO3Source.id = "ao3";
AO3Source.name = "Archive of Our Own";
AO3Source.version = "1.0.0";
AO3Source.icon = "AO3";
AO3Source.description = "Search fanfiction on Archive of Our Own (AO3) and download works as AO3's official EPUB. Paste a work link to grab it directly.";
AO3Source.contentType = "books";
AO3Source.contentTypes = ["ebook"];

AO3Source.capabilities = {
	search: true,
	discover: true,
	download: true,
	resolve: true,
	searchDownloads: false,
	bookChapters: false,
	manga: false,
};

AO3Source.BASE_URL = "https://archiveofourown.org";
AO3Source.ID_PREFIX = "ao3::";
AO3Source.FORMATS = ["epub", "azw3", "mobi", "pdf", "html"];

// ── Settings ──────────────────────────────────────────────────────────

AO3Source.getSettings = function() {
	return [
		{
			id: "sort",
			label: "Sort Search Results By",
			type: "select",
			defaultValue: "_score",
			options: [
				{ label: "Best Match", value: "_score" },
				{ label: "Kudos", value: "kudos_count" },
				{ label: "Date Updated", value: "revised_at" },
				{ label: "Date Posted", value: "created_at" },
				{ label: "Hits", value: "hits" },
				{ label: "Bookmarks", value: "bookmarks_count" },
				{ label: "Word Count", value: "word_count" },
			],
		},
		{
			id: "language",
			label: "Language",
			type: "select",
			defaultValue: "en",
			options: [
				{ label: "Any", value: "any" },
				{ label: "English", value: "en" },
				{ label: "Español", value: "es" },
				{ label: "Français", value: "fr" },
				{ label: "Deutsch", value: "de" },
				{ label: "Italiano", value: "it" },
				{ label: "Português brasileiro", value: "ptBR" },
				{ label: "Русский", value: "ru" },
				{ label: "中文", value: "zh" },
				{ label: "日本語", value: "ja" },
				{ label: "한국어", value: "ko" },
				{ label: "Polski", value: "pl" },
			],
		},
		{
			id: "complete_only",
			label: "Only Show Completed Works",
			type: "toggle",
			defaultValue: "false",
		},
		{
			id: "hide_explicit",
			label: "Hide Explicit-Rated Works",
			type: "toggle",
			defaultValue: "false",
		},
		{
			id: "format",
			label: "Download Format",
			type: "select",
			defaultValue: "epub",
			options: [
				{ label: "EPUB", value: "epub" },
				{ label: "AZW3", value: "azw3" },
				{ label: "MOBI", value: "mobi" },
				{ label: "PDF", value: "pdf" },
				{ label: "HTML", value: "html" },
			],
		},
		{
			id: "discover_fandoms",
			label: "Discover Fandoms (comma separated, optional)",
			type: "text",
			defaultValue: "",
			placeholder: "e.g. Harry Potter - J. K. Rowling",
		},
		{
			id: "show_restricted",
			label: "Show Members-Only Works",
			type: "toggle",
			defaultValue: "false",
		},
		{
			id: "session_cookie",
			label: "AO3 Session Cookie (optional, for members-only works)",
			type: "password",
			defaultValue: "",
			placeholder: "_otwarchive_session=…; remember_user_token=…",
		},
	];
};

AO3Source._setting = async function(key, fallback) {
	try {
		if (typeof cinder !== "undefined" && cinder.store && cinder.store.get) {
			var value = await cinder.store.get(key);
			if (value !== undefined && value !== null && value !== "") return value;
		}
	} catch (_) {}
	return fallback;
};

AO3Source._bool = async function(key, fallback) {
	var value = await this._setting(key, fallback ? "true" : "false");
	if (typeof value === "boolean") return value;
	return String(value).toLowerCase() === "true";
};

AO3Source._cookie = async function() {
	var raw = "";
	try {
		if (typeof cinder !== "undefined" && cinder.secureStore && cinder.secureStore.get) {
			raw = await cinder.secureStore.get("session_cookie");
		}
	} catch (_) {}
	if (!raw) raw = await this._setting("session_cookie", "");
	raw = String(raw || "").trim().replace(/^cookie:\s*/i, "");
	if (!raw) return "";
	// A bare value was pasted — assume it's the session cookie.
	if (raw.indexOf("=") < 0) raw = "_otwarchive_session=" + raw;
	return raw;
};

AO3Source._format = async function() {
	var format = String(await this._setting("format", "epub")).toLowerCase();
	return this.FORMATS.indexOf(format) >= 0 ? format : "epub";
};

// ── Text helpers ──────────────────────────────────────────────────────

AO3Source._NAMED_ENTITIES = {
	amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'",
	rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
	ndash: "–", mdash: "—", hellip: "…", eacute: "é",
};

AO3Source._decode = function(text) {
	var self = this;
	return String(text || "")
		.replace(/&#(\d+);/g, function(_, code) { return String.fromCharCode(parseInt(code, 10)); })
		.replace(/&#x([0-9a-f]+);/gi, function(_, code) { return String.fromCharCode(parseInt(code, 16)); })
		.replace(/&([a-z]+);/gi, function(whole, name) {
			var key = name.toLowerCase();
			return Object.prototype.hasOwnProperty.call(self._NAMED_ENTITIES, key) ? self._NAMED_ENTITIES[key] : whole;
		});
};

// Plain single-line text.
AO3Source._text = function(html) {
	return this._decode(String(html || "")
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]*>/g, " "))
		.replace(/\s+/g, " ")
		.trim();
};

// Multi-paragraph text (summaries) — keeps paragraph breaks.
AO3Source._paragraphs = function(html) {
	var withBreaks = String(html || "")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p\s*>/gi, "\n\n")
		.replace(/<\/(div|li|blockquote)\s*>/gi, "\n");
	return this._decode(withBreaks.replace(/<[^>]*>/g, ""))
		.split("\n")
		.map(function(line) { return line.replace(/[ \t ]+/g, " ").trim(); })
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
};

AO3Source._int = function(text) {
	var digits = this._text(text).replace(/[^\d]/g, "");
	return digits ? parseInt(digits, 10) : 0;
};

AO3Source._formatCount = function(n) {
	return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

AO3Source._linkTexts = function(html) {
	var out = [];
	var re = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
	var m;
	while ((m = re.exec(String(html || ""))) !== null) {
		var t = this._text(m[1]);
		if (t) out.push(t);
	}
	return out;
};

AO3Source._match = function(html, re) {
	var m = String(html || "").match(re);
	return m ? m[1] : "";
};

AO3Source._fileSlug = function(title) {
	var slug = String(title || "");
	try { if (slug.normalize) slug = slug.normalize("NFKD"); } catch (_) {}
	slug = slug.replace(/[̀-ͯ]/g, "")
		.replace(/[^A-Za-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 60);
	return slug || "work";
};

AO3Source._safeFileName = function(title, author, ext) {
	var base = String(title || "AO3 Work");
	if (author) base += " - " + author;
	base = base.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
	return (base || "AO3 Work") + "." + ext;
};

// ── IDs & URLs ────────────────────────────────────────────────────────

AO3Source._workIdFrom = function(value) {
	var s = String(value || "").trim();
	var prefixed = s.indexOf(this.ID_PREFIX) === 0;
	if (prefixed) s = s.slice(this.ID_PREFIX.length);
	if (prefixed) return /^\d+$/.test(s) ? s : "";
	var m = s.match(/archiveofourown\.org\/works\/(\d+)/i) || s.match(/^\/?works\/(\d+)/i) || s.match(/^ao3:\s*(\d+)$/i) || s.match(/^(\d{5,})$/);
	return m ? m[1] : "";
};

AO3Source._workUrl = function(workId) {
	return this.BASE_URL + "/works/" + workId + "?view_adult=true";
};

AO3Source._downloadUrl = function(workId, title, format) {
	return this.BASE_URL + "/downloads/" + workId + "/" + this._fileSlug(title) + "." + format;
};

AO3Source._buildSearchUrl = function(opts) {
	var p = [];
	var add = function(k, v) { p.push(encodeURIComponent(k) + "=" + encodeURIComponent(v)); };
	add("work_search[query]", opts.query || "");
	if (opts.fandoms) add("work_search[fandom_names]", opts.fandoms);
	if (opts.language && opts.language !== "any") add("work_search[language_id]", opts.language);
	if (opts.complete) add("work_search[complete]", "T");
	add("work_search[sort_column]", opts.sort || "_score");
	add("work_search[sort_direction]", "desc");
	if (opts.page && opts.page > 0) add("page", String(opts.page + 1));
	return this.BASE_URL + "/works/search?" + p.join("&");
};

// ── Networking ────────────────────────────────────────────────────────

AO3Source._headers = async function(referer) {
	var headers = {
		"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 CinderReader-AO3/1.0",
		"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
		"Referer": referer || this.BASE_URL + "/",
	};
	var cookie = await this._cookie();
	if (cookie) headers["Cookie"] = cookie;
	return headers;
};

AO3Source._looksChallenged = function(html) {
	return /just a moment|cf-challenge|checking your browser|verify you are human/i.test(String(html || "").slice(0, 4000));
};

AO3Source._fetchHtml = async function(url) {
	var headers = await this._headers();
	var response = null;
	try {
		response = await cinder.fetch(url, { headers: headers, timeout: 25000 });
	} catch (e) {
		cinder.warn("AO3 fetch error", url, e && e.message);
	}
	if (response && response.status === 429) {
		throw new Error("AO3 is rate-limiting requests right now. Wait a minute or two and try again.");
	}
	var html = response && response.data ? String(response.data) : "";
	var ok = response && response.status >= 200 && response.status < 300 && html && !this._looksChallenged(html);

	if (!ok && typeof cinder.fetchBrowser === "function" && (!response || response.status === 403 || response.status === 503 || this._looksChallenged(html))) {
		try {
			var bh = { "X-Cinder-Suppress-Interactive": "1" };
			if (headers.Cookie) bh.Cookie = headers.Cookie;
			response = await cinder.fetchBrowser(url, { headers: bh, timeout: 30000 });
			html = response && response.data ? String(response.data) : "";
			ok = response && (!response.status || (response.status >= 200 && response.status < 300)) && html && !this._looksChallenged(html);
		} catch (e2) {
			cinder.warn("AO3 browser fetch error", url, e2 && e2.message);
		}
	}
	return { ok: !!ok, status: response ? response.status : 0, html: html };
};

AO3Source._isLoginPage = function(html) {
	return /only available to registered users|<form[^>]+id="new_user"|users\/login/i.test(String(html || "")) &&
		!/<h2 class="title heading"/i.test(String(html || ""));
};

// ── Parsing: search-result blurbs ─────────────────────────────────────

AO3Source._splitBlurbs = function(html) {
	var src = String(html || "");
	var re = /<li\b[^>]*\bid=["']work_(\d+)["'][^>]*>/gi;
	var starts = [];
	var m;
	while ((m = re.exec(src)) !== null) starts.push({ id: m[1], index: m.index });
	var blurbs = [];
	for (var i = 0; i < starts.length; i++) {
		var end = i + 1 < starts.length ? starts[i + 1].index : src.indexOf("</ol>", starts[i].index);
		if (end < 0) end = src.length;
		blurbs.push({ id: starts[i].id, html: src.slice(starts[i].index, end) });
	}
	return blurbs;
};

AO3Source._parseTagList = function(html) {
	var tags = { warnings: [], relationships: [], characters: [], freeforms: [] };
	var re = /<li\s+class=["'](warnings|relationships|characters|freeforms)["'][^>]*>([\s\S]*?)<\/li>/gi;
	var m;
	while ((m = re.exec(String(html || ""))) !== null) {
		var t = this._linkTexts(m[2]);
		if (t.length) tags[m[1]].push(t[0]);
	}
	return tags;
};

AO3Source._parseStats = function(html) {
	var stats = {};
	var re = /<dd\s+class=["']([a-z ]+)["'][^>]*>([\s\S]*?)<\/dd>/gi;
	var m;
	while ((m = re.exec(String(html || ""))) !== null) {
		var key = m[1].split(" ")[0];
		if (!(key in stats)) stats[key] = this._text(m[2]);
	}
	return stats;
};

AO3Source._parseBlurb = function(blurb) {
	var h = blurb.html;
	var heading = this._match(h, /<h4\b[^>]*class=["'][^"']*heading[^"']*["'][^>]*>([\s\S]*?)<\/h4>/i);
	var title = this._text(this._match(heading, /<a\b[^>]*href=["']\/works\/\d+["'][^>]*>([\s\S]*?)<\/a>/i));
	if (!title) return null;

	var authors = [];
	var ar = /<a\b[^>]*rel=["']author["'][^>]*>([\s\S]*?)<\/a>/gi;
	var am;
	while ((am = ar.exec(heading)) !== null) authors.push(this._text(am[1]));
	if (!authors.length && /Anonymous/.test(heading)) authors.push("Anonymous");

	var fandoms = this._linkTexts(this._match(h, /<h5\b[^>]*class=["'][^"']*fandoms[^"']*["'][^>]*>([\s\S]*?)<\/h5>/i));
	var rating = this._decode(this._match(h, /class=["'][^"']*\brating\b[^"']*["'][^>]*title=["']([^"']+)["']/i));
	var completeFlag = this._match(h, /class=["'][^"']*complete-(yes|no)[^"']*["']/i);
	var restricted = /title=["']Restricted["']|alt=["']\(Restricted\)["']/i.test(heading);
	var summary = this._paragraphs(this._match(h, /<blockquote\b[^>]*class=["'][^"']*summary[^"']*["'][^>]*>([\s\S]*?)<\/blockquote>/i));
	var updated = this._text(this._match(h, /<p\b[^>]*class=["']datetime["'][^>]*>([\s\S]*?)<\/p>/i));
	var series = this._text(this._match(h, /<ul\b[^>]*class=["']series["'][^>]*>([\s\S]*?)<\/ul>/i));
	var tags = this._parseTagList(this._match(h, /<ul\b[^>]*class=["']tags[^"']*["'][^>]*>([\s\S]*?)<\/ul>\s*(?:<!--|<h6|<blockquote|<ul|<dl)/i) || h);
	var stats = this._parseStats(this._match(h, /<dl\b[^>]*class=["']stats["'][^>]*>([\s\S]*?)<\/dl>/i));

	var chapters = stats.chapters || "";
	var complete = completeFlag ? completeFlag.toLowerCase() === "yes" : this._chaptersComplete(chapters);

	return {
		workId: blurb.id,
		title: title,
		authors: authors,
		fandoms: fandoms,
		rating: rating,
		restricted: restricted,
		complete: complete,
		summary: summary,
		updated: updated,
		series: series,
		tags: tags,
		language: stats.language || "",
		words: this._int(stats.words || ""),
		chapters: chapters.replace(/\s+/g, ""),
		kudos: this._int(stats.kudos || ""),
		hits: this._int(stats.hits || ""),
		bookmarks: this._int(stats.bookmarks || ""),
	};
};

AO3Source._chaptersComplete = function(chapters) {
	var m = String(chapters || "").replace(/,/g, "").match(/(\d+)\s*\/\s*(\d+|\?)/);
	return !!(m && m[2] !== "?" && m[1] === m[2]);
};

AO3Source.parseSearchResults = function(html) {
	var works = [];
	var blurbs = this._splitBlurbs(html);
	for (var i = 0; i < blurbs.length; i++) {
		var w = this._parseBlurb(blurbs[i]);
		if (w) works.push(w);
	}
	return works;
};

// ── Parsing: work page ────────────────────────────────────────────────

AO3Source._metaDd = function(html, cls) {
	var re = new RegExp("<dd\\s+class=[\"']" + cls + "[^\"']*[\"'][^>]*>([\\s\\S]*?)<\\/dd>", "i");
	return this._match(html, re);
};

AO3Source.parseWorkPage = function(html, workId) {
	var h = String(html || "");
	var titleHtml = this._match(h, /<h2\b[^>]*class=["']title heading["'][^>]*>([\s\S]*?)<\/h2>/i);
	var title = this._text(titleHtml);
	if (!title) return null;
	var byline = this._match(h, /<h3\b[^>]*class=["']byline heading["'][^>]*>([\s\S]*?)<\/h3>/i);
	var authors = [];
	var ar = /<a\b[^>]*rel=["']author["'][^>]*>([\s\S]*?)<\/a>/gi;
	var am;
	while ((am = ar.exec(byline)) !== null) authors.push(this._text(am[1]));
	if (!authors.length && /Anonymous/.test(byline)) authors.push("Anonymous");

	var summary = this._paragraphs(this._match(h, /<div\b[^>]*class=["']summary module["'][^>]*>[\s\S]*?<blockquote\b[^>]*class=["']userstuff["'][^>]*>([\s\S]*?)<\/blockquote>/i));
	var stats = this._parseStats(this._match(h, /<dl\b[^>]*class=["']stats["'][^>]*>([\s\S]*?)<\/dl>/i));
	var chapters = (stats.chapters || "").replace(/\s+/g, "");

	var downloads = {};
	var dr = /href=["']((?:https?:\/\/archiveofourown\.org)?\/downloads\/\d+\/[^"']+?\.(epub|azw3|mobi|pdf|html)(?:\?[^"']*)?)["']/gi;
	var dm;
	while ((dm = dr.exec(h)) !== null) {
		var ext = dm[2].toLowerCase();
		if (!downloads[ext]) {
			var href = this._decode(dm[1]);
			downloads[ext] = /^https?:/i.test(href) ? href : this.BASE_URL + href;
		}
	}

	var series = this._text(this._match(h, /<dd\s+class=["']series["'][^>]*>([\s\S]*?)<\/dd>/i));

	return {
		workId: workId,
		title: title,
		authors: authors,
		fandoms: this._linkTexts(this._metaDd(h, "fandom tags")),
		rating: this._linkTexts(this._metaDd(h, "rating tags"))[0] || "",
		restricted: /title=["']Restricted["']|alt=["']\(Restricted\)["']/i.test(titleHtml),
		complete: this._chaptersComplete(chapters),
		summary: summary,
		updated: stats.status || stats.published || "",
		series: series,
		tags: {
			warnings: this._linkTexts(this._metaDd(h, "warning tags")),
			relationships: this._linkTexts(this._metaDd(h, "relationship tags")),
			characters: this._linkTexts(this._metaDd(h, "character tags")),
			freeforms: this._linkTexts(this._metaDd(h, "freeform tags")),
		},
		language: this._text(this._metaDd(h, "language")),
		words: this._int(stats.words || ""),
		chapters: chapters,
		kudos: this._int(stats.kudos || ""),
		hits: this._int(stats.hits || ""),
		bookmarks: this._int(stats.bookmarks || ""),
		downloads: downloads,
	};
};

// ── Result building ───────────────────────────────────────────────────

AO3Source._metaLine = function(w) {
	var parts = [];
	if (w.fandoms && w.fandoms.length) parts.push(w.fandoms.slice(0, 3).join(", ") + (w.fandoms.length > 3 ? " +" + (w.fandoms.length - 3) : ""));
	if (w.rating) parts.push(w.rating);
	if (w.words) parts.push(this._formatCount(w.words) + " words");
	if (w.chapters) parts.push("Ch. " + w.chapters + (w.complete ? " (Complete)" : " (WIP)"));
	if (w.kudos) parts.push(this._formatCount(w.kudos) + " kudos");
	if (w.restricted) parts.push("🔒 Members only");
	return parts.join(" • ");
};

AO3Source._toResult = function(w, format) {
	var author = w.authors && w.authors.length ? w.authors.join(", ") : "";
	var meta = this._metaLine(w);
	var ships = w.tags && w.tags.relationships && w.tags.relationships.length ? "Relationships: " + w.tags.relationships.slice(0, 4).join("; ") : "";
	var description = [meta, ships, w.summary].filter(function(x) { return !!x; }).join("\n\n");
	var url = (w.downloads && w.downloads[format]) || this._downloadUrl(w.workId, w.title, format);

	return {
		id: this.ID_PREFIX + w.workId,
		title: w.title,
		author: author,
		description: description,
		url: url,
		format: format,
		source: this.name,
		extra: {
			description: description,
			workId: w.workId,
			workUrl: this.BASE_URL + "/works/" + w.workId,
			fandoms: w.fandoms || [],
			rating: w.rating || "",
			relationships: (w.tags && w.tags.relationships) || [],
			characters: (w.tags && w.tags.characters) || [],
			tags: (w.tags && w.tags.freeforms) || [],
			warnings: (w.tags && w.tags.warnings) || [],
			words: w.words || 0,
			chapters: w.chapters || "",
			complete: !!w.complete,
			kudos: w.kudos || 0,
			hits: w.hits || 0,
			language: w.language || "",
			updated: w.updated || "",
			series: w.series || "",
			restricted: !!w.restricted,
			status: w.complete ? "completed" : "ongoing",
		},
	};
};

AO3Source._filterWorks = async function(works) {
	var hideExplicit = await this._bool("hide_explicit", false);
	var hasCookie = !!(await this._cookie());
	var showRestricted = hasCookie || (await this._bool("show_restricted", false));
	return works.filter(function(w) {
		if (hideExplicit && /explicit/i.test(w.rating || "")) return false;
		if (!showRestricted && w.restricted) return false;
		return true;
	});
};

// ── Search ────────────────────────────────────────────────────────────

AO3Source._lookupWork = async function(workId) {
	var res = await this._fetchHtml(this._workUrl(workId));
	if (!res.ok) {
		if (res.status === 404) return null;
		throw new Error("Couldn't reach AO3 (status " + (res.status || "no response") + ").");
	}
	if (this._isLoginPage(res.html)) {
		var lockedErr = new Error("That work is members-only. Add your AO3 session cookie in the extension settings to access it.");
		lockedErr.code = "AO3_RESTRICTED";
		throw lockedErr;
	}
	return this.parseWorkPage(res.html, workId);
};

AO3Source._searchWorks = async function(opts) {
	var url = this._buildSearchUrl(opts);
	var res = await this._fetchHtml(url);
	if (!res.ok) {
		cinder.warn("AO3 search failed", res.status, url);
		return [];
	}
	var works = this.parseSearchResults(res.html);
	works = await this._filterWorks(works);
	var format = await this._format();
	var self = this;
	return works.map(function(w) { return self._toResult(w, format); });
};

AO3Source.search = async function(query, page) {
	page = page || 0;
	var q = String(query || "").trim();

	// Pasted work link or ID → return that single work.
	var directId = this._workIdFrom(q);
	if (directId) {
		if (page > 0) return [];
		var work = await this._lookupWork(directId);
		if (!work) return [];
		return [this._toResult(work, await this._format())];
	}

	return this._searchWorks({
		query: q,
		page: page,
		sort: await this._setting("sort", "_score"),
		language: await this._setting("language", "en"),
		complete: await this._bool("complete_only", false),
	});
};

// ── Discover ──────────────────────────────────────────────────────────

AO3Source.DISCOVER = {
	updated: { title: "Recently Updated", icon: "✨", sort: "revised_at" },
	kudos: { title: "Most Kudos", icon: "❤️", sort: "kudos_count" },
	complete: { title: "Completed Favorites", icon: "✅", sort: "kudos_count", complete: true },
	bookmarks: { title: "Most Bookmarked", icon: "🔖", sort: "bookmarks_count" },
};

AO3Source._discoverFandoms = async function() {
	var raw = String(await this._setting("discover_fandoms", "") || "");
	return raw.split(",").map(function(s) { return s.trim(); }).filter(function(s) { return !!s; }).slice(0, 5);
};

AO3Source.getDiscoverSections = async function() {
	var sections = [];
	var fandoms = await this._discoverFandoms();
	for (var i = 0; i < fandoms.length; i++) {
		sections.push({ id: "fandom:" + i + ":updated", title: fandoms[i] + " — Recently Updated", icon: "✨" });
		sections.push({ id: "fandom:" + i + ":kudos", title: fandoms[i] + " — Most Kudos", icon: "❤️" });
	}
	var keys = Object.keys(this.DISCOVER);
	for (var k = 0; k < keys.length; k++) {
		var d = this.DISCOVER[keys[k]];
		sections.push({ id: keys[k], title: d.title, icon: d.icon });
	}
	return sections;
};

AO3Source.getDiscoverItems = async function(sectionId, page) {
	page = page || 0;
	var id = String(sectionId || "");
	var fandom = "";
	var fm = id.match(/^fandom:(\d+):(\w+)$/);
	if (fm) {
		var fandoms = await this._discoverFandoms();
		fandom = fandoms[parseInt(fm[1], 10)] || "";
		id = fm[2];
	}
	var d = this.DISCOVER[id];
	if (!d) return [];
	var completeSetting = await this._bool("complete_only", false);
	return this._searchWorks({
		query: "",
		fandoms: fandom,
		page: page,
		sort: d.sort,
		language: await this._setting("language", "en"),
		complete: !!d.complete || completeSetting,
	});
};

// ── Details ───────────────────────────────────────────────────────────

AO3Source.getBookDetails = async function(bookId) {
	var workId = this._workIdFrom(bookId);
	if (!workId) return null;
	var work;
	try {
		work = await this._lookupWork(workId);
	} catch (e) {
		if (e && e.code === "AO3_RESTRICTED") return null;
		throw e;
	}
	if (!work) return null;
	var result = this._toResult(work, await this._format());
	return {
		id: result.id,
		title: result.title,
		author: result.author,
		description: result.description,
		extra: result.extra,
	};
};

// ── Download ──────────────────────────────────────────────────────────

AO3Source.resolve = async function(item) {
	var workId = this._workIdFrom((item && item.extra && item.extra.workId) || (item && item.id) || (item && item.url));
	if (!workId) throw new Error("This doesn't look like an AO3 work.");
	var format = await this._format();
	var title = (item && item.title) || "AO3 Work";
	var author = (item && item.author) || "";
	var url = "";

	// Prefer the exact link from the work page — it carries AO3's
	// updated_at cache-buster so you always get the latest chapters.
	try {
		var work = await this._lookupWork(workId);
		if (work) {
			title = work.title || title;
			author = (work.authors || []).join(", ") || author;
			url = work.downloads[format] || "";
		}
	} catch (e) {
		if (e && e.code === "AO3_RESTRICTED") throw e;
		if (e && /rate-limiting/.test(e.message || "")) throw e;
		cinder.warn("AO3 work page lookup failed; using direct download link", e && e.message);
	}
	if (!url) url = this._downloadUrl(workId, title, format);

	var headers = { Referer: this.BASE_URL + "/works/" + workId };
	var cookie = await this._cookie();
	if (cookie) headers.Cookie = cookie;

	return {
		url: url,
		fileName: this._safeFileName(title, author, format),
		headers: headers,
	};
};

__cinderExport = AO3Source;
