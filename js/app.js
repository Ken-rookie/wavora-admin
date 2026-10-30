(() => {
  "use strict";
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const cfg = window.WAVORA_CONFIG || {};
  let db = null, currentUser = null, profile = null;
  let songs = [], artists = [], albums = [], purchases = [], reports = [];
  let modalMode = null, toastTimer = null;

  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const dateFmt = v => v ? new Date(v).toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}) : "—";
  const money = (v,c="PHP") => `${c} ${((Number(v)||0)/100).toFixed(2)}`;
  const badge = s => `<span class="badge ${esc(String(s||"").toLowerCase())}">${esc(s||"unknown")}</span>`;
  function toast(msg, error=false){const el=$("#toast");el.textContent=msg;el.className="toast show"+(error?" error":"");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.className="toast",3500)}
  function setAuthError(msg){$("#authError").textContent=msg||""}
  function readyConfig(){return cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes("YOUR_PROJECT") && !cfg.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")}
  function fmtErr(e){return e?.message || String(e)}
  function requireDb(){if(!db) throw new Error("Supabase is not configured. Edit js/config.js first.")}
  function showAuth(){ $("#authView").classList.remove("hidden");$("#appView").classList.add("hidden"); }
  function showApp(){ $("#authView").classList.add("hidden");$("#appView").classList.remove("hidden"); }
  async function profileFor(user){
    const {data,error}=await db.from("profiles").select("id,username,display_name,role,is_active").eq("id",user.id).maybeSingle();
    if(error) throw error;
    return data;
  }
  async function verifySession(){
    const {data:{session}}=await db.auth.getSession();
    if(!session){showAuth();return}
    currentUser=session.user;
    try{
      profile=await profileFor(currentUser);
      if(!profile || profile.role!=="admin" || profile.is_active!==true){
        await db.auth.signOut();currentUser=null;profile=null;showAuth();
        setAuthError("This account does not have active admin access. Ask the project owner to grant the admin role.");return;
      }
      $("#adminName").textContent=profile.display_name||profile.username||"Wavora Admin";
      $("#adminEmail").textContent=currentUser.email||"";
      $("#adminAvatar").textContent=($("#adminName").textContent[0]||"W").toUpperCase();
      $("#topAvatar").textContent=$("#adminAvatar").textContent;
      showApp();await loadAll();
    }catch(e){showAuth();setAuthError(fmtErr(e))}
  }
  async function signIn(e){
    e.preventDefault();setAuthError("");
    if(!readyConfig()){setAuthError("Configure your Supabase URL and publishable/anon key in js/config.js.");return}
    const btn=$("#loginBtn");btn.disabled=true;btn.textContent="Signing in…";
    try{
      const {error}=await db.auth.signInWithPassword({email:$("#loginEmail").value.trim(),password:$("#loginPassword").value});
      if(error)throw error;await verifySession();
    }catch(err){setAuthError(fmtErr(err))}
    finally{btn.disabled=false;btn.innerHTML='Sign in <span>→</span>'}
  }
  async function signOut(){await db.auth.signOut();currentUser=null;profile=null;showAuth();setAuthError("")}

  async function loadAll(){
    try{
      const results=await Promise.all([
        db.from("songs").select("*, artists(name)").order("created_at",{ascending:false}).limit(500),
        db.from("artists").select("*").order("created_at",{ascending:false}).limit(500),
        db.from("albums").select("*, artists(name)").order("created_at",{ascending:false}).limit(500),
        db.from("purchases").select("id,user_id,song_id,amount_minor,currency,status,provider,provider_reference,paid_at,created_at,songs(title)").order("created_at",{ascending:false}).limit(500),
        db.from("content_reports").select("*, songs(title)").order("created_at",{ascending:false}).limit(500)
      ]);
      const labels=["songs","artists","albums","purchases","reports"];
      results.forEach((r,i)=>{if(r.error)throw new Error(`${labels[i]}: ${r.error.message}`)});
      [songs,artists,albums,purchases,reports]=results.map(r=>r.data||[]);
      renderOverview();renderSongs();renderArtists();renderAlbums();renderPurchases();renderReports();
      $("#navSongCount").textContent=songs.length;$("#navReportCount").textContent=reports.filter(r=>["open","reviewing"].includes(r.status)).length;
    }catch(e){toast("Could not load live data: "+fmtErr(e),true)}
  }
  function songName(s){return s?.title||"Untitled"}
  function coverCell(path,title){
    let url=path||"";
    if(url && !/^https?:\/\//i.test(url) && db) url=db.storage.from("cover-art").getPublicUrl(url).data.publicUrl;
    return `<div class="track-cell">${url?`<img class="cover" src="${esc(url)}" alt="" loading="lazy" onerror="this.style.display='none'">`:`<div class="cover cover-placeholder">♫</div>`}<div><div class="track-title">${esc(title||"Untitled")}</div></div></div>`;
  }
  function renderOverview(){
    const published=songs.filter(s=>s.is_published).length,drafts=songs.length-published,paid=purchases.filter(p=>p.status==="paid"),revenue=paid.reduce((n,p)=>n+(Number(p.amount_minor)||0),0);
    const cards=[
      ["Catalog tracks",songs.length,"♫","All songs and videos"],
      ["Published",published,"◉",`${drafts} drafts or unpublished`],
      ["Paid purchases",paid.length,"＄","Verified paid records only"],
      ["Recorded revenue",money(revenue,"PHP"),"↗","Based on purchase currency amounts"]
    ];
    $("#statsGrid").innerHTML=cards.map(c=>`<article class="stat-card"><div class="stat-top"><span>${c[0]}</span><span class="stat-icon">${c[2]}</span></div><div class="stat-value">${esc(c[1])}</div><div class="stat-foot">${esc(c[3])}</div></article>`).join("");
    const latest=[...songs].slice(0,6);
    $("#recentSongs").innerHTML=latest.length?table(["RELEASE","ARTIST","PRICE","STATUS"],latest.map(s=>[
      coverCell(s.cover_path,s.title),esc(s.artists?.name||"—"),esc(s.is_free||!s.price_minor?"Free":money(s.price_minor,s.currency)),badge(s.is_published?"published":"draft")
    ])):`<div class="empty-state"><strong>No catalog releases yet</strong>Add your first real song to populate this dashboard.</div>`;
    $("#catalogStatus").innerHTML=[
      ["Audio files linked",songs.filter(s=>s.audio_path).length],
      ["Music videos linked",songs.filter(s=>s.video_path).length],
      ["Featured releases",songs.filter(s=>s.is_featured).length]
    ].map(x=>`<div class="status-item"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join("");
  }
  function table(headers,rows){return `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell??"—"}</td>`).join("")}</tr>`).join("")}</tbody></table>`}
  function empty(msg){return `<div class="empty-state"><strong>${esc(msg)}</strong>No matching records were returned by Supabase.</div>`}
  function renderSongs(){
    const q=($("#songSearch")?.value||"").toLowerCase(),filter=$("#songStatusFilter")?.value||"all";
    const rows=songs.filter(s=>(`${s.title} ${s.genre||""} ${s.artists?.name||""}`).toLowerCase().includes(q))
      .filter(s=>filter==="all"||(filter==="published"&&s.is_published)||(filter==="draft"&&!s.is_published)||(filter==="featured"&&s.is_featured));
    $("#songsTable").innerHTML=rows.length?table(["SONG","GENRE","PRICE","MEDIA","STATUS","ACTIONS"],rows.map(s=>[
      coverCell(s.cover_path,s.title)+`<div class="track-sub">${esc(s.artists?.name||"Unknown artist")}</div>`,
      esc(s.genre||"—"),esc(s.is_free||!s.price_minor?"Free":money(s.price_minor,s.currency)),
      `${s.audio_path?"♫ audio":"—"}${s.video_path?" · ▷ video":""}`,
      badge(s.is_published?"published":"draft"),
      `<div class="row-actions"><button class="small-btn" data-edit-song="${s.id}">Edit</button><button class="small-btn" data-toggle-song="${s.id}">${s.is_published?"Unpublish":"Publish"}</button><button class="small-btn danger" data-delete-song="${s.id}">Delete</button></div>`
    ])):empty("No songs found");
  }
  function renderArtists(){
    const q=($("#artistSearch")?.value||"").toLowerCase();
    const rows=artists.filter(a=>(`${a.name} ${a.slug||""} ${a.bio||""}`).toLowerCase().includes(q));
    $("#artistsTable").innerHTML=rows.length?table(["ARTIST","SLUG","VERIFIED","RELEASES","CREATED","ACTIONS"],rows.map(a=>[
      coverCell(a.image_path,a.name),esc(a.slug||"—"),badge(a.is_verified?"verified":"draft"),songs.filter(s=>s.artist_id===a.id).length,dateFmt(a.created_at),
      `<div class="row-actions"><button class="small-btn" data-edit-artist="${a.id}">Edit</button><button class="small-btn danger" data-delete-artist="${a.id}">Delete</button></div>`
    ])):empty("No artists found");
  }
  function renderAlbums(){
    const q=($("#albumSearch")?.value||"").toLowerCase();
    const rows=albums.filter(a=>(`${a.title} ${a.artists?.name||""}`).toLowerCase().includes(q));
    $("#albumsTable").innerHTML=rows.length?table(["ALBUM","ARTIST","RELEASE DATE","TRACKS","CREATED","ACTIONS"],rows.map(a=>[
      coverCell(a.cover_path,a.title),esc(a.artists?.name||"—"),dateFmt(a.release_date),songs.filter(s=>s.album_id===a.id).length,dateFmt(a.created_at),
      `<div class="row-actions"><button class="small-btn" data-edit-album="${a.id}">Edit</button><button class="small-btn danger" data-delete-album="${a.id}">Delete</button></div>`
    ])):empty("No albums found");
  }
  function renderPurchases(){
    const q=($("#purchaseSearch")?.value||"").toLowerCase(),f=$("#purchaseFilter")?.value||"all";
    const rows=purchases.filter(p=>(`${p.id} ${p.user_id} ${p.songs?.title||""} ${p.provider_reference||""}`).toLowerCase().includes(q)).filter(p=>f==="all"||p.status===f);
    $("#purchasesTable").innerHTML=rows.length?table(["PURCHASE","USER ID","SONG","AMOUNT","PROVIDER","STATUS","DATE"],rows.map(p=>[
      `<span title="${esc(p.id)}">${esc(p.id.slice(0,8))}…</span>`,`<span title="${esc(p.user_id)}">${esc(p.user_id.slice(0,8))}…</span>`,esc(p.songs?.title||p.song_id),
      esc(money(p.amount_minor,p.currency)),esc(p.provider||"—"),badge(p.status),dateFmt(p.created_at)
    ])):empty("No purchases found");
  }
  function renderReports(){
    const q=($("#reportSearch")?.value||"").toLowerCase(),f=$("#reportFilter")?.value||"all";
    const rows=reports.filter(r=>(`${r.reason} ${r.details||""} ${r.songs?.title||""}`).toLowerCase().includes(q)).filter(r=>f==="all"||r.status===f);
    $("#reportsTable").innerHTML=rows.length?table(["REPORT","SONG","REASON / DETAILS","STATUS","SUBMITTED","ACTIONS"],rows.map(r=>[
      `<span title="${esc(r.id)}">${esc(r.id.slice(0,8))}…</span>`,esc(r.songs?.title||"—"),`<strong>${esc(r.reason)}</strong><div class="track-sub">${esc(r.details||"No details")}</div>`,
      badge(r.status),dateFmt(r.created_at),`<select class="small-btn" data-report-status="${r.id}" aria-label="Change report status"><option ${r.status==="open"?"selected":""}>open</option><option ${r.status==="reviewing"?"selected":""}>reviewing</option><option ${r.status==="resolved"?"selected":""}>resolved</option><option ${r.status==="dismissed"?"selected":""}>dismissed</option></select>`
    ])):empty("No reports found");
  }

  function field(name,label,type="text",value="",opts={}) {
    const id=`f_${name}`,cls=opts.full?"field full-width":"field",req=opts.required?"required":"";
    let control;
    if(type==="select")control=`<select id="${id}" name="${name}" ${req}>${opts.options.map(o=>`<option value="${esc(o.value)}" ${String(o.value)===String(value)?"selected":""}>${esc(o.label)}</option>`).join("")}</select>`;
    else if(type==="textarea")control=`<textarea id="${id}" name="${name}" ${req} placeholder="${esc(opts.placeholder||"")}">${esc(value)}</textarea>`;
    else control=`<input id="${id}" name="${name}" type="${type}" value="${esc(value)}" ${req} ${opts.step?`step="${opts.step}"`:""} ${opts.min!==undefined?`min="${opts.min}"`:""} placeholder="${esc(opts.placeholder||"")}">`;
    return `<label class="${cls}" for="${id}">${label}${control}${opts.hint?`<span class="hint">${esc(opts.hint)}</span>`:""}</label>`;
  }
  function check(name,label,checked=false){return `<label class="check-field"><input type="checkbox" name="${name}" ${checked?"checked":""}>${label}</label>`}
  function openModal(title,mode,html){
    modalMode=mode;$("#modalTitle").textContent=title;$("#modalBody").innerHTML=html;$("#modalError").textContent="";$("#modalBackdrop").classList.remove("hidden");
  }
  function closeModal(){$("#modalBackdrop").classList.add("hidden");$("#entityForm").reset();modalMode=null}
  function artistOptions(selected=""){return [{value:"",label:"No artist assigned"},...artists.map(a=>({value:a.id,label:a.name}))].map(o=>`<option value="${esc(o.value)}" ${o.value===selected?"selected":""}>${esc(o.label)}</option>`).join("")}
  function albumOptions(selected=""){return [{value:"",label:"No album assigned"},...albums.map(a=>({value:a.id,label:a.title}))].map(o=>`<option value="${esc(o.value)}" ${o.value===selected?"selected":""}>${esc(o.label)}</option>`).join("")}
  function openSong(song=null){
    const s=song||{};
    openModal(song?"Edit release":"Add a release",{kind:"song",id:s.id||null},`
      ${field("title","Song title","text",s.title||"",{required:true})}
      ${field("genre","Genre","text",s.genre||"",{placeholder:"e.g. Pop, R&B"})}
      <label class="field" for="f_artist_id">Artist<select id="f_artist_id" name="artist_id">${artistOptions(s.artist_id||"")}</select></label>
      <label class="field" for="f_album_id">Album<select id="f_album_id" name="album_id">${albumOptions(s.album_id||"")}</select></label>
      ${field("price","Price (PHP)","number",((s.price_minor||0)/100).toFixed(2),{required:true,min:0,step:"0.01",hint:"Stored as minor units (centavos). Free tracks should have price 0."})}
      ${field("currency","Currency","text",s.currency||"PHP",{required:true})}
      ${field("duration_seconds","Duration (seconds)","number",s.duration_seconds??"",{min:0})}
      ${field("cover_file","Cover artwork","file","",{full:true})}
      ${field("audio_file","Audio file","file","",{full:true,hint:"MP3, AAC, WAV, OGG or MP4 audio. Uploaded to private audio bucket."})}
      ${field("video_file","Music video","file","",{full:true,hint:"MP4, WebM or QuickTime. Uploaded to private music-videos bucket."})}
      ${field("cover_path","Existing cover path","text",s.cover_path||"",{full:true,placeholder:"Optional storage path or https URL"})}
      ${field("audio_path","Existing audio path","text",s.audio_path||"",{full:true,placeholder:"Optional storage object path"})}
      ${field("video_path","Existing video path","text",s.video_path||"",{full:true,placeholder:"Optional storage object path"})}
      ${check("is_free","Free to play",!!s.is_free)}
      ${check("has_music_video","Has music video",!!s.has_music_video)}
      ${check("is_featured","Feature on home page",!!s.is_featured)}
      ${check("is_published","Publish immediately",!!s.is_published)}
    `);
  }
  function openArtist(a=null){
    const x=a||{};
    openModal(a?"Edit artist":"Add artist",{kind:"artist",id:x.id||null},`
      ${field("name","Artist name","text",x.name||"",{required:true})}
      ${field("slug","URL slug","text",x.slug||"",{placeholder:"artist-name"})}
      ${field("image_file","Artist image","file","",{full:true})}
      ${field("image_path","Existing image path","text",x.image_path||"",{full:true})}
      ${field("bio","Biography","textarea",x.bio||"",{full:true})}
      ${check("is_verified","Verified artist",!!x.is_verified)}
    `);
  }
  function openAlbum(a=null){
    const x=a||{};
    openModal(a?"Edit album":"Add album",{kind:"album",id:x.id||null},`
      ${field("title","Album title","text",x.title||"",{required:true})}
      <label class="field" for="f_artist_id">Artist<select id="f_artist_id" name="artist_id">${artistOptions(x.artist_id||"")}</select></label>
      ${field("release_date","Release date","date",x.release_date||"")}
      ${field("cover_file","Cover artwork","file","",{full:true})}
      ${field("cover_path","Existing cover path","text",x.cover_path||"",{full:true})}
      ${field("description","Description","textarea",x.description||"",{full:true})}
    `);
  }
  async function uploadIfSelected(formData,name,bucket,folder){
    const file=formData.get(name);
    if(!(file instanceof File)||!file.size)return null;
    const ext=(file.name.split(".").pop()||"bin").toLowerCase().replace(/[^a-z0-9]/g,"");
    const path=`${folder}/${crypto.randomUUID()}.${ext}`;
    const {error}=await db.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type||undefined});
    if(error)throw error;return path;
  }
  async function submitEntity(e){
    e.preventDefault();if(!modalMode)return;
    const btn=$("#modalSubmit");btn.disabled=true;btn.textContent="Saving…";$("#modalError").textContent="";
    try{
      const fd=new FormData(e.currentTarget),kind=modalMode.kind,id=modalMode.id;
      if(kind==="song"){
        const title=String(fd.get("title")||"").trim();if(!title)throw new Error("Song title is required.");
        const price=Math.round(Number(fd.get("price")||0)*100);if(!Number.isFinite(price)||price<0)throw new Error("Enter a valid non-negative price.");
        const artistId=String(fd.get("artist_id")||"")||null,albumId=String(fd.get("album_id")||"")||null;
        const old=songs.find(s=>s.id===id)||{};
        const cover=await uploadIfSelected(fd,"cover_file","cover-art",id||crypto.randomUUID());
        const audio=await uploadIfSelected(fd,"audio_file","audio",id||crypto.randomUUID());
        const video=await uploadIfSelected(fd,"video_file","music-videos",id||crypto.randomUUID());
        const coverPath=cover||String(fd.get("cover_path")||"").trim()||old.cover_path||null;
        const audioPath=audio||String(fd.get("audio_path")||"").trim()||old.audio_path||null;
        const videoPath=video||String(fd.get("video_path")||"").trim()||old.video_path||null;
        const hasVideo=fd.has("has_music_video")||!!videoPath;
        if(hasVideo&&!videoPath)throw new Error("A music video is enabled, but no video file/path was supplied.");
        const row={title,genre:String(fd.get("genre")||"").trim()||null,artist_id:artistId,album_id:albumId,price_minor:price,currency:(String(fd.get("currency")||"PHP").trim().toUpperCase()),duration_seconds:fd.get("duration_seconds")?Number(fd.get("duration_seconds")):null,cover_path:coverPath,audio_path:audioPath,video_path:videoPath,has_music_video:hasVideo,is_free:fd.has("is_free"),is_featured:fd.has("is_featured"),is_published:fd.has("is_published"),updated_at:new Date().toISOString(),created_by:currentUser.id};
        if(row.is_published&&!old.published_at)row.published_at=new Date().toISOString();
        if(id){delete row.created_by;const {error}=await db.from("songs").update(row).eq("id",id);if(error)throw error}
        else{const {error}=await db.from("songs").insert(row);if(error)throw error}
      } else if(kind==="artist"){
        const row={name:String(fd.get("name")||"").trim(),slug:String(fd.get("slug")||"").trim()||null,bio:String(fd.get("bio")||"").trim()||null,is_verified:fd.has("is_verified")};
        const image=await uploadIfSelected(fd,"image_file","cover-art",id||crypto.randomUUID());
        row.image_path=image||String(fd.get("image_path")||"").trim()||artists.find(a=>a.id===id)?.image_path||null;
        if(id){const {error}=await db.from("artists").update(row).eq("id",id);if(error)throw error}
        else{row.owner_user_id=currentUser.id;const {error}=await db.from("artists").insert(row);if(error)throw error}
      } else if(kind==="album"){
        const row={title:String(fd.get("title")||"").trim(),artist_id:String(fd.get("artist_id")||"")||null,release_date:String(fd.get("release_date")||"")||null,description:String(fd.get("description")||"").trim()||null};
        const image=await uploadIfSelected(fd,"cover_file","cover-art",id||crypto.randomUUID());
        row.cover_path=image||String(fd.get("cover_path")||"").trim()||albums.find(a=>a.id===id)?.cover_path||null;
        if(id){const {error}=await db.from("albums").update(row).eq("id",id);if(error)throw error}
        else{const {error}=await db.from("albums").insert(row);if(error)throw error}
      }
      closeModal();toast("Changes saved.");await loadAll();
    }catch(err){$("#modalError").textContent=fmtErr(err);toast(fmtErr(err),true)}
    finally{btn.disabled=false;btn.textContent="Save changes"}
  }
  async function toggleSong(id){
    const s=songs.find(x=>x.id===id);if(!s)return;
    const next=!s.is_published;
    if(next&&(!s.audio_path||!s.cover_path)){toast("Add audio and cover artwork before publishing.",true);return}
    if(next&&!s.is_free&&Number(s.price_minor)>0&&!s.currency){toast("Set a valid currency before publishing.",true);return}
    if(!confirm(`${next?"Publish":"Unpublish"} "${s.title}"?`))return;
    const row={is_published:next,updated_at:new Date().toISOString()};
    if(next&&!s.published_at)row.published_at=new Date().toISOString();
    const {error}=await db.from("songs").update(row).eq("id",id);
    if(error)toast(fmtErr(error),true);else{toast(next?"Song published":"Song unpublished");await loadAll()}
  }
  async function deleteSong(id){
    const s=songs.find(x=>x.id===id);if(!s||!confirm(`Delete "${s.title}" from the catalog? Existing purchases may prevent deletion. This does not automatically remove storage files.`))return;
    const {error}=await db.from("songs").delete().eq("id",id);
    if(error)toast(fmtErr(error),true);else{toast("Song deleted.");await loadAll()}
  }
  async function deleteArtist(id){
    const a=artists.find(x=>x.id===id);if(!a||!confirm(`Delete artist "${a.name}"? Related song artist references will be cleared.`))return;
    const {error}=await db.from("artists").delete().eq("id",id);
    if(error)toast(fmtErr(error),true);else{toast("Artist deleted.");await loadAll()}
  }
  async function deleteAlbum(id){
    const a=albums.find(x=>x.id===id);if(!a||!confirm(`Delete album "${a.title}"? Song album references will be cleared.`))return;
    const {error}=await db.from("albums").delete().eq("id",id);
    if(error)toast(fmtErr(error),true);else{toast("Album deleted.");await loadAll()}
  }
  async function updateReport(id,status){
    const {error}=await db.from("content_reports").update({status,reviewed_by:currentUser.id,reviewed_at:new Date().toISOString()}).eq("id",id);
    if(error){toast(fmtErr(error),true);await loadAll()}else{toast("Report status updated.");await loadAll()}
  }
  function navigate(page){
    $$(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${page}`));
    $$(".nav-item[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
    $("#pageCrumb").textContent=({overview:"Overview",songs:"Songs & videos",artists:"Artists",albums:"Albums",purchases:"Purchases",reports:"Reports"})[page]||"Overview";
    $("#sidebar").classList.remove("open");window.scrollTo({top:0,behavior:"smooth"});
  }
  function handleClicks(e){
    const t=e.target.closest("button,[data-edit-song],[data-toggle-song],[data-delete-song],[data-edit-artist],[data-delete-artist],[data-edit-album],[data-delete-album]");
    if(!t)return;
    if(t.dataset.page){navigate(t.dataset.page);return}
    if(t.dataset.go){navigate(t.dataset.go);return}
    if(t.dataset.action==="new-song"){openSong();return}
    if(t.id==="addSongBtn"){openSong();return}
    if(t.id==="addArtistBtn"){openArtist();return}
    if(t.id==="addAlbumBtn"){openAlbum();return}
    if(t.dataset.editSong){openSong(songs.find(s=>s.id===t.dataset.editSong));return}
    if(t.dataset.toggleSong){toggleSong(t.dataset.toggleSong);return}
    if(t.dataset.deleteSong){deleteSong(t.dataset.deleteSong);return}
    if(t.dataset.editArtist){openArtist(artists.find(a=>a.id===t.dataset.editArtist));return}
    if(t.dataset.deleteArtist){deleteArtist(t.dataset.deleteArtist);return}
    if(t.dataset.editAlbum){openAlbum(albums.find(a=>a.id===t.dataset.editAlbum));return}
    if(t.dataset.deleteAlbum){deleteAlbum(t.dataset.deleteAlbum);return}
  }
  function init(){
    $("#loginForm").addEventListener("submit",signIn);
    $("#entityForm").addEventListener("submit",submitEntity);
    $("#modalClose").addEventListener("click",closeModal);$("#modalCancel").addEventListener("click",closeModal);
    $("#modalBackdrop").addEventListener("click",e=>{if(e.target===$("#modalBackdrop"))closeModal()});
    $("#signOutBtn").addEventListener("click",signOut);
    $("#refreshBtn").addEventListener("click",loadAll);
    $("#songReload").addEventListener("click",loadAll);$("#artistReload").addEventListener("click",loadAll);$("#albumReload").addEventListener("click",loadAll);$("#purchaseReload").addEventListener("click",loadAll);$("#reportReload").addEventListener("click",loadAll);
    ["songSearch","songStatusFilter"].forEach(id=>$("#"+id).addEventListener("input",renderSongs));
    ["artistSearch"].forEach(id=>$("#"+id).addEventListener("input",renderArtists));
    ["albumSearch"].forEach(id=>$("#"+id).addEventListener("input",renderAlbums));
    ["purchaseSearch","purchaseFilter"].forEach(id=>$("#"+id).addEventListener("input",renderPurchases));
    ["reportSearch","reportFilter"].forEach(id=>$("#"+id).addEventListener("input",renderReports));
    document.addEventListener("click",handleClicks);
    document.addEventListener("change",e=>{if(e.target.matches("[data-report-status]"))updateReport(e.target.dataset.reportStatus,e.target.value)});
    $("#menuBtn").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
    if(!readyConfig()){setAuthError("Set SUPABASE_URL and SUPABASE_ANON_KEY in js/config.js to connect your project.");return}
    try{db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);db.auth.onAuthStateChange((_event,session)=>{if(!session){showAuth()}else if(!currentUser){setTimeout(verifySession,0)}});verifySession()}
    catch(e){setAuthError(fmtErr(e))}
  }
  document.addEventListener("DOMContentLoaded",init);
})();