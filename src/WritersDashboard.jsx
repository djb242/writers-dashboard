import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Plus, Play, Pause, StopCircle, Target, Calendar, TimerReset, Trash2, Wand2, Tag, Search, NotebookPen, Lightbulb, Rocket, BarChart3, ListTodo, Save, UploadCloud, Download, ChevronRight, Edit2 } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, BarChart, Bar } from "recharts";
import { supabase } from "./lib/supabase";


// ------------------------------
// Types
// ------------------------------
function uid() { return Math.random().toString(36).slice(2); }

/** @typedef {{ id: string, title: string, description?: string, targetWords: number, deadline?: string, status: 'Drafting'|'Editing'|'Complete', createdAt: string, archived?: boolean }} Project */
/** @typedef {{ id: string, projectId?: string, date: string, minutes: number, words: number, notes?: string }} Session */
/** @typedef {{ id: string, text: string, tags: string[], projectId?: string, createdAt: string, pinned?: boolean }} Idea */

// ------------------------------
// Persistence
// ------------------------------
const STORE_KEY = "writers_dashboard_v1";
function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); }
  catch { return {}; }
}
function saveStore(data) { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }

// ------------------------------
// Helpers
// ------------------------------
function fmtDate(d){ return new Date(d).toLocaleDateString(undefined,{ month:"short", day:"numeric" }); }
function daysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return d; }
function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }
function sum(arr,sel=(x)=>x){ return arr.reduce((a,b)=>a+sel(b),0); }

// Generate simple prompts
const PROMPTS = [
  "Write a scene where a character receives unexpected help.",
  "Describe a place using only sounds and smells.",
  "Your protagonist has 10 minutes to decide: stay or go?",
  "Write a dialogue with hidden subtext—two people want the opposite, but neither says it.",
  "Recount a memory that changes meaning halfway through.",
  "Open with the weather—but make it matter.",
  "A letter is delivered to the wrong person.",
];

// ------------------------------
// Main App
// ------------------------------
export default function WritersDashboard({ userId }) {
  const initial = useMemo(()=>{
    const d = loadStore();
    return /** @type {{projects: Project[], sessions: Session[], ideas: Idea[], dailyGoal: number}} */ ({
      projects: d.projects || [],
      sessions: d.sessions || [],
      ideas: d.ideas || [],
      dailyGoal: d.dailyGoal || 500,
    });
  },[]);

  const [projects, setProjects] = useState(initial.projects);
  const [sessions, setSessions] = useState(initial.sessions);
  const [ideas, setIdeas] = useState(initial.ideas);
  const [dailyGoal, setDailyGoal] = useState(initial.dailyGoal);
  const [dailyGoalText, setDailyGoalText] = useState(String(initial.dailyGoal));

  // Load from Supabase when a user signs in
  useEffect(() => {
    if (!userId) return;

    (async () => {
      const { data, error } = await supabase
        .from("app_state")
        .select("data")
        .eq("user_id", userId)
        .single();

      // Ignore "no rows" error; anything else log it
      if (error && error.code !== "PGRST116") {
        console.error("cloud load error:", error);
        return;
      }

      const cloud = data?.data;
      if (cloud && typeof cloud === "object") {
        setProjects(cloud.projects || []);
        setSessions(cloud.sessions || []);
        setIdeas(cloud.ideas || []);
        setDailyGoal(cloud.dailyGoal || 500);
      } else {
        // optional: create an empty row for this user so future saves are updates
        await supabase.from("app_state").upsert({
          user_id: userId,
          data: { projects: [], sessions: [], ideas: [], dailyGoal: 500 },
          updated_at: new Date().toISOString(),
        });
      }
    })();
  }, [userId]);


  useEffect(()=>{ saveStore({ projects, sessions, ideas, dailyGoal }); },[projects,sessions,ideas,dailyGoal]);

  // --- cloud save effect ---
  useEffect(() => {
    if (!userId) return; // only sync if logged in

    const payload = { projects, sessions, ideas, dailyGoal };

    (async () => {
      const { error } = await supabase
        .from("app_state")
        .upsert({
          user_id: userId,
          data: payload,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        console.error("cloud save error:", error);
      }
    })();
  }, [projects, sessions, ideas, dailyGoal, userId]);


  // Derived stats
  const today = new Date().toISOString().slice(0,10);
  const todaysWords = useMemo(()=> sum(sessions.filter(s=>s.date===today), s=>s.words), [sessions]);
  const streak = useMemo(()=>{
    let s=0; for(let i=0;i<365;i++){ const d = daysAgo(i).toISOString().slice(0,10); const w = sum(sessions.filter(x=>x.date===d), x=>x.words); if(w>0){ s++; } else break; }
    return s;
  },[sessions]);

  const wordsLast14 = useMemo(()=>{
    const arr=[]; for(let i=13;i>=0;i--){ const d=daysAgo(i); const key=d.toISOString().slice(0,10); const w=sum(sessions.filter(x=>x.date===key), x=>x.words); arr.push({date: fmtDate(d), words:w}); }
    return arr;
  },[sessions]);

  const totalWords = useMemo(()=> sum(sessions, s=>s.words), [sessions]);
  const wph = useMemo(()=>{
    const mins = sum(sessions, s=>s.minutes) || 1; return Math.round((totalWords/mins)*60);
  },[sessions,totalWords]);

  // ------------------------------
  // CRUD Actions
  // ------------------------------
  function addProject(p){
    setProjects(prev=>[...prev, { ...p, id: uid(), createdAt: new Date().toISOString(), status: "Drafting" }]);
    toast("Project created");
  }
  function updateProject(id, patch){ setProjects(prev=>prev.map(p=>p.id===id?{...p,...patch}:p)); }
  function removeProject(id){ setProjects(prev=>prev.filter(p=>p.id!==id)); toast("Project deleted"); }

  function logSession(s){ setSessions(prev=>[...prev, { ...s, id: uid() }]); toast("Session logged"); }
  function deleteSession(id){ setSessions(prev=>prev.filter(s=>s.id!==id)); }

  function addIdea(i){ setIdeas(prev=>[{...i,id:uid(),createdAt:new Date().toISOString()},...prev]); }
  function updateIdea(id,patch){ setIdeas(prev=>prev.map(i=>i.id===id?{...i,...patch}:i)); }
  function deleteIdea(id){ setIdeas(prev=>prev.filter(i=>i.id!==id)); }

  // Export/Import JSON
  function exportJSON(){
    const blob = new Blob([JSON.stringify({projects,sessions,ideas,dailyGoal}, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download='writers-dashboard-data.json'; a.click(); URL.revokeObjectURL(url);
  }
  function importJSON(file){
    const reader = new FileReader();
    reader.onload = (e)=>{
      try{
        const d = JSON.parse(e.target.result);
        setProjects(d.projects||[]); setSessions(d.sessions||[]); setIdeas(d.ideas||[]); setDailyGoal(d.dailyGoal||500);
        toast("Data imported");
      }catch{ toast("Invalid file"); }
    };
    reader.readAsText(file);
  }

  // ------------------------------
  // Timer (Pomodoro / free timer)
  // ------------------------------
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(25*60);
  const [customMins, setCustomMins] = useState(25);
  const startSecondsRef = useRef(25*60); 
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [autoOpenLog, setAutoOpenLog] = useState(false);
  const intervalRef = useRef(null);
  const [customMinsText, setCustomMinsText] = useState(String(customMins));
  useEffect(() => { setCustomMinsText(String(customMins)); }, [customMins]);


  useEffect(()=>{
    if(timerRunning){
      intervalRef.current = setInterval(()=> setTimerSeconds(s=>s-1), 1000);
    }
    return ()=>{ if(intervalRef.current) clearInterval(intervalRef.current); };
  },[timerRunning]);

  useEffect(()=>{
    if(timerSeconds<=0){ setTimerRunning(false); setTimerSeconds(0); setAutoOpenLog(true); toast("Timer complete — log your session"); }
  },[timerSeconds]);

  function resetTimer(mins=25){ setTimerRunning(false);startSecondsRef.current = mins*60; setTimerSeconds(mins*60); }

  const minutes = Math.floor(timerSeconds/60).toString().padStart(2,'0');
  const seconds = Math.floor(timerSeconds%60).toString().padStart(2,'0');

  // ------------------------------
  // UI
  // ------------------------------
  return (
    <TooltipProvider>
      <div className="min-h-screen text-neutral-900 bg-[radial-gradient(900px_500px_at_50%_-10%,#eef2ff,white)]">
        <div className="container mx-auto max-w-6xl p-4 md:p-8">
        <Toaster richColors position="top-center" />
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Writer’s Dashboard</h1>
            <p className="text-sm text-zinc-600">Track words, log sessions, capture ideas, and keep your streak alive.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportJSON} variant="secondary"><Download className="w-4 h-4 mr-2"/>Export</Button>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <UploadCloud className="w-4 h-4"/>
              <span className="text-sm">Import</span>
              <input type="file" accept="application/json" className="hidden" onChange={(e)=> e.target.files?.[0] && importJSON(e.target.files[0])} />
            </label>
          </div>
        </header>

        {/* Top Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Today’s Words</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{todaysWords}</CardContent></Card>
          <Card className="shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Daily Goal</CardTitle></CardHeader><CardContent>
            <div className="flex items-center gap-2">
              <Input
              type="number"
              value={dailyGoalText}
              onChange={(e) => setDailyGoalText(e.target.value)}
              onBlur={() => {
                const val = parseInt(dailyGoalText, 10);
                setDailyGoal(isNaN(val) ? 0 : clamp(val, 0, 100000));
                setDailyGoalText(isNaN(val) ? "" : String(clamp(val, 0, 100000)));
              }}
              className="w-28"
            />
              <Badge variant={todaysWords>=dailyGoal?"default":"secondary"}>{Math.min(100, Math.round((todaysWords/dailyGoal)*100)) || 0}%</Badge>
            </div>
            <Progress value={Math.min(100, Math.round((todaysWords/dailyGoal)*100)) || 0} className="mt-2"/>
          </CardContent></Card>
          <Card className="shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Streak</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{streak} <span className="text-sm font-normal">day{streak===1?"":"s"}</span></CardContent></Card>
          <Card className="shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Avg Words / Hour</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{isFinite(wph)?wph:0}</CardContent></Card>
        </div>

        {/* Timer & Log */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <Card className="lg:col-span-1 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><TimerReset className="w-4 h-4"/> Focus Timer</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-5xl font-mono tabular-nums">{minutes}:{seconds}</div>
                <div className="flex gap-2">
                  {!timerRunning ? (
                    <Button onClick={()=>setTimerRunning(true)}><Play className="w-4 h-4 mr-2"/>Start</Button>
                  ) : (
                    <Button variant="secondary" onClick={()=>setTimerRunning(false)}><Pause className="w-4 h-4 mr-2"/>Pause</Button>
                  )}
                  <Button variant="ghost" onClick={()=>resetTimer(25)}><StopCircle className="w-4 h-4 mr-2"/>Reset</Button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue placeholder="Assign to project (optional)" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl z-50">
                    {projects.filter(p => !p.archived).map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Presets */}
                <Button variant="outline" onClick={() => resetTimer(50)}>50</Button>
                <Button variant="outline" onClick={() => resetTimer(15)}>15</Button>

                {/* Custom minutes */}
                <Input
                  type="number"
                  inputMode="numeric"
                  value={customMinsText}
                  onChange={(e) => setCustomMinsText(e.target.value)}   // allow "", "6", "60", etc.
                  className="w-20"
                  placeholder="mins"
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    const n = parseInt(customMinsText, 10);
                    const safe = isNaN(n) ? customMins : Math.max(1, n); // fallback to current if blank/NaN
                    setCustomMins(safe);
                    resetTimer(safe);
                  }}
                >
                  Set
                </Button>

              </div>


              <div className="flex items-center gap-2 mt-3">
                <Checkbox id="autoLog" checked={autoOpenLog} onCheckedChange={(v)=>setAutoOpenLog(Boolean(v))}/>
                <label htmlFor="autoLog" className="text-sm text-zinc-600">Open log dialog when timer ends</label>
              </div>
              <LogSessionDialog
                trigger={<Button className="mt-3 w-full" variant="secondary"><NotebookPen className="w-4 h-4 mr-2"/>Log Session</Button>}
                defaultProjectId={selectedProjectId}
                defaultMinutes={Math.max(1, Math.round((startSecondsRef.current - timerSeconds) / 60))}
                onSave={(payload)=> logSession(payload)}
                openExternally={autoOpenLog && timerSeconds===0}
                onCloseExternal={()=> setAutoOpenLog(false)}
              />
            </CardContent>
          </Card>

          {/* Trend Chart */}
          <Card className="lg:col-span-2 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4"/> Last 14 Days</CardTitle></CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={wordsLast14}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <RTooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="words" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Projects */}
          <Card className="xl:col-span-2 shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2"><Target className="w-4 h-4"/> Projects</CardTitle>
              <NewProjectDialog onCreate={addProject} />
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {projects.filter(p=>!p.archived).map(p=> (
                  <ProjectCard key={p.id} p={p}
                    onUpdate={(patch)=>updateProject(p.id, patch)}
                    onDelete={()=>removeProject(p.id)}
                    totalWords={sum(sessions.filter(s=>s.projectId===p.id), s=>s.words)}
                  />
                ))}
                {projects.filter(p=>!p.archived).length===0 && (
                  <div className="text-sm text-zinc-500">No projects yet. Add one to get started.</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Ideas & Prompts */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Lightbulb className="w-4 h-4"/> Ideas & Prompts</CardTitle></CardHeader>
            <CardContent>
              <IdeaCapture onAdd={addIdea} />
              <PromptBox />
              <IdeaList ideas={ideas} onUpdate={updateIdea} onDelete={deleteIdea} />
            </CardContent>
          </Card>
        </div>

        {/* Sessions Table */}
        <Card className="mt-6 shadow-sm">
          <CardHeader className="pb-2 flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2"><ListTodo className="w-4 h-4"/> Session Log</CardTitle>
            <LogSessionDialog trigger={<Button variant="outline"><NotebookPen className="w-4 h-4 mr-2"/>Quick Log</Button>} onSave={logSession} />
          </CardHeader>
          <CardContent>
            {sessions.length===0 ? (
              <div className="text-sm text-zinc-500">No sessions logged yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-zinc-600">
                    <tr>
                      <th className="py-2 pr-2">Date</th>
                      <th className="py-2 pr-2">Project</th>
                      <th className="py-2 pr-2">Minutes</th>
                      <th className="py-2 pr-2">Words</th>
                      <th className="py-2 pr-2">WPH</th>
                      <th className="py-2 pr-2">Notes</th>
                      <th className="py-2 pr-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.slice().reverse().map(s=>(
                      <tr key={s.id} className="border-t">
                        <td className="py-2 pr-2 whitespace-nowrap">{fmtDate(s.date)}</td>
                        <td className="py-2 pr-2">{projects.find(p=>p.id===s.projectId)?.title || <span className="text-zinc-400">—</span>}</td>
                        <td className="py-2 pr-2">{s.minutes}</td>
                        <td className="py-2 pr-2 font-medium">{s.words}</td>
                        <td className="py-2 pr-2">{s.minutes?Math.round((s.words/s.minutes)*60):"—"}</td>
                        <td className="py-2 pr-2 max-w-[24rem] truncate" title={s.notes||""}>{s.notes||""}</td>
                        <td className="py-2 pr-2 text-right"><Button size="icon" variant="ghost" onClick={()=>deleteSession(s.id)}><Trash2 className="w-4 h-4"/></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <footer className="text-xs text-zinc-500 mt-8 flex items-center gap-2">
          <Rocket className="w-3 h-3"/> Your data is stored locally in your browser. Export regularly if you need backups.
        </footer>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ------------------------------
// Subcomponents
// ------------------------------
function NewProjectDialog({ onCreate }){
  const [open, setOpen] = useState(false);
  const [title,setTitle] = useState("");
  const [description,setDescription] = useState("");
  const [targetWords,setTargetWords] = useState(5000);
  const [deadline,setDeadline] = useState("");

  function reset(){ setTitle(""); setDescription(""); setTargetWords(5000); setDeadline(""); }

  function create(){
    if(!title.trim()) return toast("Title is required");
    onCreate({ title, description, targetWords, deadline });
    reset(); setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 mr-2"/>New Project</Button>
      </DialogTrigger>
      <DialogContent className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>Set goals to track progress and deadlines.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Input placeholder="Title" value={title} onChange={(e)=>setTitle(e.target.value)} />
          <Textarea placeholder="Description (optional)" value={description} onChange={(e)=>setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-600">Target words</label>
              <Input type="number" value={targetWords} onChange={(e)=>setTargetWords(parseInt(e.target.value||"0"))} />
            </div>
            <div>
              <label className="text-xs text-zinc-600">Deadline (optional)</label>
              <Input type="date" value={deadline} onChange={(e)=>setDeadline(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={create}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectCard({ p, onUpdate, onDelete, totalWords }){
  const pct = p.targetWords ? Math.min(100, Math.round((totalWords/p.targetWords)*100)) : 0;

  return (
    <Card className="">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold">{p.title}</CardTitle>
            {p.description && <p className="text-xs text-zinc-600 mt-1">{p.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Select value={p.status} onValueChange={(v)=>onUpdate({status: v})}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl z-50" >
                <SelectItem value="Drafting">Drafting</SelectItem>
                <SelectItem value="Editing">Editing</SelectItem>
                <SelectItem value="Complete">Complete</SelectItem>
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" onClick={()=>onUpdate({ archived: true })}><Trash2 className="w-4 h-4"/></Button>
              </TooltipTrigger>
              <TooltipContent className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl" >Archive</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm mb-2">
          <div className="flex items-center gap-2 text-zinc-600">
            <Target className="w-4 h-4"/> <span>{totalWords.toLocaleString()} / {p.targetWords.toLocaleString()} words</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-600">
            <Calendar className="w-4 h-4"/>
            <span>{p.deadline ? new Date(p.deadline).toLocaleDateString() : "No deadline"}</span>
          </div>
        </div>
        <Progress value={pct} />
        <div className="flex items-center justify-end mt-3 gap-2">
          <InlineEdit target={p.targetWords} label="Target" onChange={(val)=>onUpdate({targetWords: val})}/>
          <EditProjectDialog p={p} onUpdate={onUpdate} onDelete={onDelete} />
        </div>
      </CardContent>
    </Card>
  );
}

function InlineEdit({ target, label, onChange }){
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(target);
  useEffect(()=>setVal(target),[target]);
  return (
    <div className="text-xs text-zinc-600 flex items-center gap-2">
      <span>{label}:</span>
      {editing ? (
        <div className="flex items-center gap-2">
          <Input className="h-7 w-24" type="number" value={val} onChange={(e)=>setVal(parseInt(e.target.value||"0"))}/>
          <Button size="sm" onClick={()=>{ onChange(val); setEditing(false); }}>Save</Button>
        </div>
      ):(
        <button className="inline-flex items-center gap-1 hover:underline" onClick={()=>setEditing(true)}>
          <span className="font-medium">{target.toLocaleString()}</span> <Edit2 className="w-3 h-3"/>
        </button>
      )}
    </div>
  );
}

function EditProjectDialog({ p, onUpdate, onDelete }){
  const [open, setOpen] = useState(false);
  const [title,setTitle] = useState(p.title);
  const [description,setDescription] = useState(p.description||"");
  const [deadline,setDeadline] = useState(p.deadline||"");
  useEffect(()=>{ setTitle(p.title); setDescription(p.description||""); setDeadline(p.deadline||""); },[p]);

  function save(){ onUpdate({ title, description, deadline }); setOpen(false); }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm"><Edit2 className="w-3 h-3 mr-1"/>Edit</Button></DialogTrigger>
      <DialogContent className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Input value={title} onChange={(e)=>setTitle(e.target.value)} />
          <Textarea value={description} onChange={(e)=>setDescription(e.target.value)} />
          <div>
            <label className="text-xs text-zinc-600">Deadline (optional)</label>
            <Input type="date" value={deadline} onChange={(e)=>setDeadline(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="justify-between">
          <Button variant="destructive" onClick={()=>{ onDelete(); setOpen(false); }}>Delete</Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={()=>setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogSessionDialog({ trigger, onSave, defaultProjectId="", defaultMinutes=25, openExternally=false, onCloseExternal }){
  const [open, setOpen] = useState(false);
  const [projectId,setProjectId] = useState(defaultProjectId);
  const [date,setDate] = useState(new Date().toISOString().slice(0,10));
  const [minutes,setMinutes] = useState(defaultMinutes);
  const [words,setWords] = useState(0);
  const [notes,setNotes] = useState("");

  useEffect(()=>{ setProjectId(defaultProjectId); },[defaultProjectId]);
  useEffect(()=>{ if(openExternally) setOpen(true); },[openExternally]);

  function save(){
    if(minutes<=0 && words<=0){ toast("Add minutes or words"); return; }
    onSave({ projectId: projectId || undefined, date, minutes, words, notes });
    setOpen(false); setMinutes(defaultMinutes); setWords(0); setNotes(""); setDate(new Date().toISOString().slice(0,10)); setProjectId(defaultProjectId);
    if(onCloseExternal) onCloseExternal();
  }

  return (
    <Dialog open={open} onOpenChange={(v)=>{ setOpen(v); if(!v && onCloseExternal) onCloseExternal(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl">
        <DialogHeader>
          <DialogTitle>Log Writing Session</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-600">Date</label>
              <Input type="date" value={date} onChange={(e)=>setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-zinc-600">Minutes</label>
              <Input type="number" value={minutes} onChange={(e)=>setMinutes(parseInt(e.target.value||"0"))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-600">Words</label>
              <Input type="number" value={words} onChange={(e)=>setWords(parseInt(e.target.value||"0"))} />
            </div>
            <div>
              <label className="text-xs text-zinc-600">Project (optional)</label>
              <ProjectSelect value={projectId} onChange={setProjectId} />
            </div>
          </div>
          <Textarea placeholder="Notes (what you worked on, issues, etc.)" value={notes} onChange={(e)=>setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button onClick={save}><Save className="w-4 h-4 mr-2"/>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectSelect({ value, onChange }){
  const data = loadStore();
  const projects = data.projects?.filter(p=>!p.archived) || [];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Choose"/></SelectTrigger>
      <SelectContent className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl z-50" >
        {projects.map(p=> (<SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>))}
      </SelectContent>
    </Select>
  );
}

function IdeaCapture({ onAdd }){
  const [text,setText] = useState("");
  const [tags,setTags] = useState("");
  const [projectId,setProjectId] = useState("");

  function add(){
    const t = text.trim(); if(!t) return;
    const tagList = tags.split(",").map(s=>s.trim()).filter(Boolean);
    onAdd({ text:t, tags: tagList, projectId: projectId || undefined });
    setText(""); setTags(""); setProjectId("");
  }

  return (
    <div className="mb-4 p-3 rounded-2xl border bg-white shadow-xs">
      <div className="grid gap-2">
        <Textarea placeholder="Quick capture an idea, snippet, quote..." value={text} onChange={(e)=>setText(e.target.value)} />
        <div className="grid grid-cols-3 gap-2">
          <Input placeholder="tags (comma-separated)" value={tags} onChange={(e)=>setTags(e.target.value)} />
          <ProjectSelect value={projectId} onChange={setProjectId} />
          <Button onClick={add}><Plus className="w-4 h-4 mr-2"/>Add</Button>
        </div>
      </div>
    </div>
  );
}

function IdeaList({ ideas, onUpdate, onDelete }){
  const [query,setQuery] = useState("");
  const [tagFilter,setTagFilter] = useState("");
  const tags = Array.from(new Set(ideas.flatMap(i=>i.tags)));
  const filtered = ideas.filter(i=>
    (!query || i.text.toLowerCase().includes(query.toLowerCase())) &&
    (!tagFilter || i.tags.includes(tagFilter))
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-2 top-2.5 text-zinc-400"/>
          <Input className="pl-7" placeholder="Search ideas" value={query} onChange={(e)=>setQuery(e.target.value)} />
        </div>
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Filter tag" /></SelectTrigger>
          <SelectContent className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl z-50" >
            {tags.map(t=> <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
        {filtered.length===0 && <div className="text-sm text-zinc-500">No ideas yet.</div>}
        {filtered.map(i=> (
          <div key={i.id} className="p-3 rounded-xl border bg-zinc-50">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm leading-snug whitespace-pre-wrap">{i.text}</p>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={()=>onUpdate(i.id, { pinned: !i.pinned })}>
                  <Wand2 className={`w-4 h-4 ${i.pinned?"text-zinc-900":"text-zinc-400"}`}/>
                </Button>
                <Button size="icon" variant="ghost" onClick={()=>onDelete(i.id)}><Trash2 className="w-4 h-4"/></Button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex flex-wrap gap-1">
                {i.tags.map(t=> <Badge key={t} variant="secondary" className="flex items-center gap-1"><Tag className="w-3 h-3"/>{t}</Badge>)}
              </div>
              <span className="text-[10px] text-zinc-500">{new Date(i.createdAt).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PromptBox(){
  const [prompt,setPrompt] = useState("");
  function roll(){ setPrompt(PROMPTS[Math.floor(Math.random()*PROMPTS.length)]); }
  useEffect(()=>{ roll(); },[]);
  return (
    <div className="mb-4 p-3 rounded-2xl border bg-white shadow-xs">
      <div className="text-xs text-zinc-600 mb-1">Prompt</div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm flex-1">{prompt}</p>
        <Button variant="outline" onClick={roll}><Wand2 className="w-4 h-4 mr-2"/>New</Button>
      </div>
    </div>
  );
}
