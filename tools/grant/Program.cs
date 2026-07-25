// jondash-grant — the grant manager (OPS-18).
//
// Creates and removes ONE OS-level grant per fixed action, so a JonDash helper can restart an
// allowlisted service later without a prompt. See JonDash-addons/helpers/ELEVATION.md for the
// shared design and docs/ROADMAP.md § OPS-18 for the settled contract.
//
// WHY THIS IS A COMPILED BINARY AND NOT A SCRIPT
// UAC displays the name and publisher of the *executable* being elevated. That is the entire
// reason this lives in core rather than in a helper — a helper can spawn a process, but it
// cannot make Windows say "JonDash" in the consent dialog. It also means the logic must be
// COMPILED IN: a shim that elevates and then runs a script from the install directory would be
// a local privilege escalation, because the unprivileged app can rewrite that script.
//
// THE RULE THAT MUST NEVER BE RELAXED
// A granted action is fully self-contained. The registered task runs a fixed command with the
// service name baked into the task definition. It never reads what to do from a file or any
// other mutable source. `schtasks /run` cannot pass arguments, so the set of things that can
// happen without a prompt is fixed at the moment the admin approved it, and is enforced by
// Windows rather than by our code.
//
// GRAMMAR, NOT POLICY
// This binary fixes only the verbs it can express at all: start, stop, restart, against a named
// service. There is deliberately no syntax for "run this command" or "read the action from this
// file", so a fully compromised caller cannot express the escalation shape. The *policy* — which
// services are allowed — is owned by the helper's admin allowlist, not duplicated here.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;

static class Program
{
    const string FolderName = "JonDash";
    const string FolderPath = "\\" + FolderName;

    // Exit codes. 1223 is ERROR_CANCELLED — "the admin said no" is a first-class outcome, not an
    // error, and it must be distinguishable from "the action failed" (ELEVATION.md rule 6).
    const int ExitOk = 0;
    const int ExitUsage = 2;
    const int ExitFailed = 3;
    const int ExitNoDesktop = 4;
    const int ExitDeclined = 1223;

    // Task Scheduler COM constants.
    const int CreateOrUpdate = 6;
    const int LogonServiceAccount = 5;
    const int RunLevelHighest = 1;
    const int ActionExec = 0;

    static readonly string[] AllVerbs = { "start", "stop", "restart" };

    static int Main(string[] args)
    {
        try { return Run(args); }
        catch (Exception ex)
        {
            Console.Error.WriteLine("error: " + ex.Message);
            return ExitFailed;
        }
    }

    static int Run(string[] args)
    {
        var a = Args.Parse(args);
        if (a.Command == null) { Usage(); return ExitUsage; }

        switch (a.Command)
        {
            case "list": return List(a.Json);
            case "create": return Create(a);
            case "remove": return Remove(a);
            case "help": Usage(); return ExitOk;
            // Prints what a name would sanitise to, and exits. No privilege, no side effects.
            // Exists so the name-handling rules can actually be TESTED — they are the path-escape
            // defence, and the add-ons session sanitises independently, so both sides need to run
            // the same vectors and agree. Untestable safety logic is how two implementations drift.
            case "check-name": Console.WriteLine(Sanitize(a.Id)); return ExitOk;
            default: Usage(); return ExitUsage;
        }
    }

    // ---------------------------------------------------------------- create

    static int Create(Args a)
    {
        if (string.IsNullOrEmpty(a.Service)) { Console.Error.WriteLine("error: --service is required"); return ExitUsage; }

        var verbs = ParseVerbs(a.Verb);
        if (verbs.Count == 0) { Console.Error.WriteLine("error: --verb must be one or more of start,stop,restart"); return ExitUsage; }

        // The id defaults to the service name. Sanitising is a PATH-ESCAPE DEFENCE, not tidiness:
        // backslash is the Task Scheduler folder separator, so an unsanitised name could climb out
        // of JonDash\. The add-ons session sanitises too; both layers stay, and neither is removed
        // on the grounds that the other exists.
        string id = Sanitize(string.IsNullOrEmpty(a.Id) ? a.Service : a.Id);
        if (id.Length == 0) { Console.Error.WriteLine("error: --id/--service produced an empty name after sanitising"); return ExitUsage; }

        // Declared separately, not inline: the C# compiler that ships in Windows is C# 5, and
        // `out int x` inline declarations are C# 7. Keeping to C# 5 is what lets this build with
        // no toolchain installed — see build.ps1.
        int relaunchExit;
        if (!Elevate.Ensure(a, out relaunchExit)) return relaunchExit;

        var svc = Connect();
        string by = string.IsNullOrEmpty(a.By) ? CurrentUserName() : a.By;
        string sddl = BuildSddl(a.Account);
        // The same protected descriptor guards the folder AND each task: JonDash may enumerate and
        // run, administrators and SYSTEM may manage, nobody else gets anything.
        var folder = EnsureFolder(svc, sddl);

        var created = new List<string>();
        foreach (var verb in verbs)
        {
            string name = UniqueName(folder, id + "-" + verb, created);
            RegisterOne(svc, folder, name, a.Service, verb, by, sddl, a.Once);
            created.Add(name);
            Console.WriteLine(FolderPath + "\\" + name);
        }
        return ExitOk;
    }

    static void RegisterOne(dynamic svc, dynamic folder, string name, string service, string verb, string by, string sddl, bool once)
    {
        dynamic def = svc.NewTask(0);

        // Set through the COM object model, never by building XML strings — the description
        // carries an operator-supplied label, and a label containing "</Description>" would break
        // a hand-built XML registration. COM does the escaping.
        def.RegistrationInfo.Description =
            "added by " + by + " on " + DateTime.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) +
            " for the service-control module. Fixed action: " + verb + " the \"" + service + "\" service. " +
            "Managed by JonDash (jondash-grant). Remove it here or in JonDash; both work.";
        def.RegistrationInfo.Author = "JonDash";

        // Runs as SYSTEM so the grant works with nobody logged in — that asymmetry (creating needs
        // an interactive desktop, using one does not) is what makes unattended automation possible.
        def.Principal.UserId = "SYSTEM";
        def.Principal.LogonType = LogonServiceAccount;
        def.Principal.RunLevel = RunLevelHighest;

        def.Settings.Enabled = true;
        def.Settings.Hidden = false;
        def.Settings.StartWhenAvailable = false;
        def.Settings.DisallowStartIfOnBatteries = false;
        def.Settings.StopIfGoingOnBatteries = false;
        def.Settings.ExecutionTimeLimit = "PT5M";
        def.Settings.MultipleInstances = 2; // ignore a second run while one is in flight

        // No triggers: this task only ever runs on demand, via `schtasks /run`.

        // net.exe rather than sc.exe: `net stop` blocks until the service has actually stopped, so
        // a restart can be two sequential actions without racing. `sc stop` returns immediately and
        // the following `sc start` would often fail. Both binaries are present on every Windows.
        string system32 = Environment.GetFolderPath(Environment.SpecialFolder.System);

        foreach (var step in StepsFor(verb))
        {
            dynamic act = def.Actions.Create(ActionExec);
            // ABSOLUTE path into System32, never a bare "net.exe" — a bare name would be resolved
            // through PATH at run time, and PATH is not something we control.
            act.Path = system32 + "\\net.exe";
            // The service name is baked in HERE, at creation time, under UAC. This is the whole
            // security property: the task carries the complete action and reads nothing at run time.
            act.Arguments = step + " \"" + service.Replace("\"", "") + "\"";
            // Pin the working directory too. Left unset, the child could start in a directory an
            // attacker can write to, which is a DLL-search-order hijack against net.exe — the
            // executable would be genuine and the code loaded alongside it would not be.
            act.WorkingDirectory = system32;
        }

        // A ONE-SHOT grant deletes itself as its final action, so nothing outlives the single use
        // it was approved for. Still fully self-contained — a fixed command naming a fixed task —
        // so it does not reopen the mutable-source hole. Runs as SYSTEM, so it may delete itself.
        //
        // The trade-off is real and belongs to the caller, not to this binary: a self-deleting
        // grant cannot serve unattended automation (a health check restarting a hung service needs
        // the grant to still be there next time), and re-granting means another UAC prompt.
        if (once)
        {
            dynamic del = def.Actions.Create(ActionExec);
            del.Path = system32 + "\\schtasks.exe";
            del.Arguments = "/delete /tn \"" + FolderPath + "\\" + name + "\" /f";
            del.WorkingDirectory = system32;
            def.RegistrationInfo.Description += " ONE-SHOT: deletes itself after running once.";
        }

        folder.RegisterTaskDefinition(name, def, CreateOrUpdate, null, null, LogonServiceAccount, sddl);
    }

    static IEnumerable<string> StepsFor(string verb)
    {
        if (verb == "start") return new[] { "start" };
        if (verb == "stop") return new[] { "stop" };
        return new[] { "stop", "start" }; // restart
    }

    // ---------------------------------------------------------------- remove

    static int Remove(Args a)
    {
        // --remove-all exists for uninstall: when JonDash or the helper goes away, no grant may
        // survive it. A leftover elevated task is exactly the "random task present" the owner
        // does not want, and it would keep working long after the thing that justified it is gone.
        if (!a.All && string.IsNullOrEmpty(a.Id) && string.IsNullOrEmpty(a.Service))
        {
            Console.Error.WriteLine("error: --remove needs --id, --service, or --all");
            return ExitUsage;
        }

        int relaunchExit;
        if (!Elevate.Ensure(a, out relaunchExit)) return relaunchExit;

        var svc = Connect();
        dynamic folder;
        try { folder = svc.GetFolder(FolderPath); }
        catch { return ExitOk; } // idempotent: nothing to remove is success

        // Matching is done against the tasks that actually exist, and only inside JonDash\ —
        // this binary has no way to name a task anywhere else.
        string prefix = a.All ? null : Sanitize(string.IsNullOrEmpty(a.Id) ? a.Service : a.Id);
        var targets = new List<string>();
        foreach (dynamic t in folder.GetTasks(1))
        {
            string n = (string)t.Name;
            if (a.All) { targets.Add(n); continue; }
            bool match = string.Equals(n, prefix, StringComparison.OrdinalIgnoreCase);
            if (!match)
                foreach (var v in AllVerbs)
                    if (n.StartsWith(prefix + "-" + v, StringComparison.OrdinalIgnoreCase)) { match = true; break; }
            if (match) targets.Add(n);
        }

        foreach (var n in targets)
        {
            folder.DeleteTask(n, 0);
            Console.WriteLine("removed " + FolderPath + "\\" + n);
        }

        // Tidy the folder away once it is empty, so an uninstalled JonDash leaves nothing behind.
        try
        {
            int left = 0;
            foreach (var _ in folder.GetTasks(1)) left++;
            if (left == 0) svc.GetFolder("\\").DeleteFolder(FolderName, 0);
        }
        catch { /* leaving an empty folder is harmless */ }

        return ExitOk;
    }

    // ------------------------------------------------------------------ list

    // Reads from the OS, never from a file we keep, so it cannot drift from what is actually
    // granted. Deliberately does NOT require elevation — reading is not a privileged act, and a
    // UAC prompt just to answer "what may JonDash do?" would train people to click through.
    static int List(bool json)
    {
        var svc = Connect();
        dynamic folder;
        try { folder = svc.GetFolder(FolderPath); }
        catch { Console.WriteLine(json ? "[]" : "(no grants)"); return ExitOk; }

        var rows = new List<string>();
        foreach (dynamic t in folder.GetTasks(1))
        {
            dynamic d = t.Definition;
            var cmd = new StringBuilder();
            foreach (dynamic act in d.Actions)
            {
                if (cmd.Length > 0) cmd.Append(" && ");
                cmd.Append(System.IO.Path.GetFileName((string)act.Path)).Append(' ').Append((string)act.Arguments);
            }
            if (json)
            {
                rows.Add("{\"name\":" + J((string)t.Name) +
                         ",\"enabled\":" + (((bool)t.Enabled) ? "true" : "false") +
                         ",\"command\":" + J(cmd.ToString()) +
                         ",\"description\":" + J((string)d.RegistrationInfo.Description) + "}");
            }
            else
            {
                rows.Add(string.Format("{0,-28} {1}{2}", (string)t.Name, cmd, ((bool)t.Enabled) ? "" : "   [disabled]"));
            }
        }

        if (json) Console.WriteLine("[" + string.Join(",", rows.ToArray()) + "]");
        else foreach (var r in rows) Console.WriteLine(r);
        return ExitOk;
    }

    /** Minimal JSON string escaping — no serializer is available without adding a reference. */
    static string J(string s)
    {
        if (s == null) return "null";
        var sb = new StringBuilder("\"");
        foreach (char c in s)
        {
            if (c == '"' || c == '\\') sb.Append('\\').Append(c);
            else if (c == '\n') sb.Append("\\n");
            else if (c == '\r') sb.Append("\\r");
            else if (c == '\t') sb.Append("\\t");
            else if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
            else sb.Append(c);
        }
        return sb.Append('"').ToString();
    }

    // ------------------------------------------------------------- scheduler

    static dynamic Connect()
    {
        Type t = Type.GetTypeFromProgID("Schedule.Service");
        if (t == null) throw new Exception("Task Scheduler is not available on this machine.");
        dynamic svc = Activator.CreateInstance(t);
        svc.Connect();
        return svc;
    }

    /**
     * Get or create \JonDash\, and ALWAYS stamp our own security descriptor on it.
     *
     * FOLDER SQUATTING — this is not theoretical, it was measured (2026-07-25). An unprivileged
     * user CAN create a Task Scheduler folder, and Windows gives the creator this:
     *
     *     (A;ID;FA;;;<their SID>)        full access
     *     (A;OICIIOID;FA;;;CO)           CREATOR OWNER, full access, INHERITED BY CHILDREN
     *
     * So an attacker — or a compromised JonDash, which runs unprivileged — can pre-create
     * \JonDash\ before the first grant exists. Without this reset we would then register grants
     * into a folder they own, and that CREATOR OWNER ACE would inherit onto the task, letting them
     * rewrite the action into anything they like. The task runs as SYSTEM. That is a full local
     * privilege escalation, and it would defeat the entire design.
     *
     * We are elevated by the time we get here, so we can simply overwrite the descriptor whether
     * we created the folder or found it. Pre-creating it therefore gains an attacker nothing.
     */
    static dynamic EnsureFolder(dynamic svc, string sddl)
    {
        dynamic folder;
        try { folder = svc.GetFolder(FolderPath); }
        catch { folder = svc.GetFolder("\\").CreateFolder(FolderName, sddl); }

        // Belt and braces: set it even on the path where we just created it with the SDDL, because
        // "the folder already existed" is exactly the case that matters and it costs one call.
        try { folder.SetSecurityDescriptor(sddl, 0); }
        catch (Exception ex)
        {
            throw new Exception("could not secure the " + FolderPath + " folder, so refusing to " +
                                "create a grant inside it: " + ex.Message);
        }
        return folder;
    }

    /** Numeric suffix on collision, per the naming contract agreed with the add-ons session. */
    static string UniqueName(dynamic folder, string baseName, List<string> alreadyCreated)
    {
        var existing = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (dynamic t in folder.GetTasks(1)) existing.Add((string)t.Name);
        foreach (var n in alreadyCreated) existing.Add(n);

        // An exact re-create of the same grant should overwrite, not accumulate -1, -2, -3 …
        if (!existing.Contains(baseName)) return baseName;
        for (int i = 2; i < 1000; i++)
        {
            string candidate = Truncate(baseName, 60) + "-" + i.ToString(CultureInfo.InvariantCulture);
            if (!existing.Contains(candidate)) return candidate;
        }
        throw new Exception("too many name collisions for " + baseName);
    }

    // --------------------------------------------------------------- names

    static readonly Regex Allowed = new Regex("[^A-Za-z0-9._-]", RegexOptions.Compiled);

    /**
     * Readable, not opaque — the add-ons session's call, and the right one: the case for granting
     * once is that the admin can open Task Scheduler and READ exactly what JonDash may do
     * unprompted. An opaque id would forfeit the property that justifies the design.
     *
     * Safety therefore comes from the charset. Backslash is the folder separator, so stripping it
     * is what stops a crafted name climbing out of JonDash\.
     */
    static string Sanitize(string s)
    {
        if (s == null) return "";
        string clean = Allowed.Replace(s.Trim(), "");
        clean = clean.Trim('.', '-', '_');          // no leading/trailing punctuation
        return Truncate(clean, 64);
    }

    static string Truncate(string s, int max) { return s.Length <= max ? s : s.Substring(0, max); }

    static List<string> ParseVerbs(string raw)
    {
        var outv = new List<string>();
        if (string.IsNullOrEmpty(raw)) return outv;
        foreach (var part in raw.Split(','))
        {
            string v = part.Trim().ToLowerInvariant();
            if (v.Length == 0) continue;
            if (Array.IndexOf(AllVerbs, v) < 0) return new List<string>(); // unknown verb → reject the lot
            if (!outv.Contains(v)) outv.Add(v);
        }
        return outv;
    }

    // ------------------------------------------------------------ security

    /**
     * Who may trigger the grant. Administrators and SYSTEM keep full control; the JonDash account
     * gets READ + EXECUTE and nothing more — enough to run the task, not enough to rewrite what it
     * does. Getting this wrong either breaks the feature or silently widens it.
     */
    static string BuildSddl(string account)
    {
        string sid = ResolveSid(string.IsNullOrEmpty(account) ? CurrentUserName() : account);
        // "D:P" — the P is load-bearing. It marks the DACL PROTECTED, which blocks inherited ACEs
        // from the parent folder. Without it, a squatted \JonDash\ folder's CREATOR OWNER ACE
        // would flow down onto the task and hand the attacker full control of an action that runs
        // as SYSTEM. An explicit DACL that still accepts inheritance is not an explicit DACL.
        return "D:P(A;;GA;;;BA)(A;;GA;;;SY)(A;;GRGX;;;" + sid + ")";
    }

    static string ResolveSid(string account)
    {
        try
        {
            var acct = new NTAccount(account);
            return ((SecurityIdentifier)acct.Translate(typeof(SecurityIdentifier))).Value;
        }
        catch (Exception ex)
        {
            throw new Exception("could not resolve the account \"" + account + "\" to a SID: " + ex.Message +
                                ". Pass --account DOMAIN\\User explicitly.");
        }
    }

    static string CurrentUserName()
    {
        try { return WindowsIdentity.GetCurrent().Name; } catch { return Environment.UserName; }
    }

    static void Usage()
    {
        Console.WriteLine(@"jondash-grant — create and remove OS-level grants for fixed service actions.

  --create --service <name> --verb start,stop,restart [--id <name>] [--once]
           [--account <DOMAIN\User>] [--by <label>]
  --remove (--id <name> | --service <name> | --all)
  --list [--json]
  --check-name <name>        show what a name sanitises to (no privilege, no side effects)

  --once   the grant deletes itself after running once. Cannot serve unattended automation:
           a health check that restarts a hung service needs the grant to still exist next time.
  --all    remove EVERY grant and the \JonDash\ folder. This is the uninstall path — nothing
           elevated may outlive the thing that justified it.

All tasks live under Task Scheduler's \JonDash\ folder and nowhere else. Each runs a fixed
command with the service name baked in; nothing is read at run time. Creating or removing a
grant prompts for elevation once. Listing does not.

Exit codes: 0 ok · 2 usage · 3 failed · 4 no interactive desktop · 1223 declined at the prompt.");
    }

    // ------------------------------------------------------------ elevation

    static class Elevate
    {
        public static bool IsElevated()
        {
            try { return new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator); }
            catch { return false; }
        }

        /**
         * Re-launch self elevated, wait, and propagate the child's exit code.
         *
         * REFUSES RATHER THAN DEGRADES. With no interactive desktop — Session 0 (running as a
         * Windows Service), a container, headless — there is nobody to answer the prompt, so this
         * reports why and does nothing. It must never fall back to a broader standing privilege.
         *
         * Returns true when the caller is already elevated and should carry on.
         */
        public static bool Ensure(Args a, out int exitCode)
        {
            exitCode = 0;
            if (IsElevated()) return true;

            if (!Environment.UserInteractive || Process.GetCurrentProcess().SessionId == 0)
            {
                Console.Error.WriteLine(
                    "error: creating a grant needs an interactive desktop to show the elevation prompt, " +
                    "and this process has none (Session 0, a container, or headless). Nothing was changed. " +
                    "Note that USING an existing grant does not need one — only creating it does.");
                exitCode = ExitNoDesktop;
                return false;
            }

            // Carry the ORIGINAL user across the elevation boundary. After elevating we may be a
            // different account, and the grant must be readable by whoever actually runs JonDash.
            var argv = new StringBuilder();
            argv.Append(a.Rebuild(CurrentUserName()));

            var si = new SHELLEXECUTEINFO();
            si.cbSize = Marshal.SizeOf(si);
            si.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NO_CONSOLE;
            si.lpVerb = "runas";                       // <- this is what raises UAC
            si.lpFile = Process.GetCurrentProcess().MainModule.FileName;
            si.lpParameters = argv.ToString();
            si.nShow = SW_HIDE;

            if (!ShellExecuteEx(ref si))
            {
                int err = Marshal.GetLastWin32Error();
                if (err == ERROR_CANCELLED)
                {
                    // Declined is NOT a failure. Different meaning, different retry policy.
                    Console.Error.WriteLine("declined: the elevation prompt was dismissed. Nothing was changed.");
                    exitCode = ExitDeclined;
                    return false;
                }
                Console.Error.WriteLine("error: could not elevate (win32 " + err + ")");
                exitCode = ExitFailed;
                return false;
            }

            WaitForSingleObject(si.hProcess, INFINITE);
            uint child;
            GetExitCodeProcess(si.hProcess, out child);
            CloseHandle(si.hProcess);
            exitCode = (int)child;
            return false; // the elevated child did the work
        }

        const int SEE_MASK_NOCLOSEPROCESS = 0x00000040;
        const int SEE_MASK_NO_CONSOLE = 0x00008000;
        const int SW_HIDE = 0;
        const int ERROR_CANCELLED = 1223;
        const uint INFINITE = 0xFFFFFFFF;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct SHELLEXECUTEINFO
        {
            public int cbSize; public int fMask; public IntPtr hwnd;
            [MarshalAs(UnmanagedType.LPWStr)] public string lpVerb;
            [MarshalAs(UnmanagedType.LPWStr)] public string lpFile;
            [MarshalAs(UnmanagedType.LPWStr)] public string lpParameters;
            [MarshalAs(UnmanagedType.LPWStr)] public string lpDirectory;
            public int nShow; public IntPtr hInstApp; public IntPtr lpIDList;
            [MarshalAs(UnmanagedType.LPWStr)] public string lpClass;
            public IntPtr hkeyClass; public uint dwHotKey; public IntPtr hIcon; public IntPtr hProcess;
        }

        [DllImport("shell32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern bool ShellExecuteEx(ref SHELLEXECUTEINFO lpExecInfo);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool CloseHandle(IntPtr hObject);
    }

    // ----------------------------------------------------------------- args

    sealed class Args
    {
        public string Command, Service, Verb, Id, Account, By;
        public bool Json, All, Once;

        public static Args Parse(string[] argv)
        {
            var a = new Args();
            for (int i = 0; i < argv.Length; i++)
            {
                string k = argv[i];
                switch (k)
                {
                    case "--create": a.Command = "create"; break;
                    case "--remove": a.Command = "remove"; break;
                    case "--list": a.Command = "list"; break;
                    case "--check-name": a.Command = "check-name"; a.Id = Next(argv, ref i); break;
                    case "--help": case "-h": case "/?": a.Command = "help"; break;
                    case "--json": a.Json = true; break;
                    case "--all": a.All = true; break;
                    case "--once": a.Once = true; break;
                    case "--service": a.Service = Next(argv, ref i); break;
                    case "--verb": a.Verb = Next(argv, ref i); break;
                    case "--id": a.Id = Next(argv, ref i); break;
                    case "--account": a.Account = Next(argv, ref i); break;
                    case "--by": a.By = Next(argv, ref i); break;
                    default:
                        Console.Error.WriteLine("error: unknown argument \"" + k + "\"");
                        return new Args();
                }
            }
            return a;
        }

        static string Next(string[] argv, ref int i)
        {
            if (i + 1 >= argv.Length) throw new Exception("missing value after " + argv[i]);
            return argv[++i];
        }

        /** Rebuild the command line for the elevated relaunch, pinning the original account. */
        public string Rebuild(string originalUser)
        {
            var sb = new StringBuilder();
            sb.Append("--").Append(Command);
            if (!string.IsNullOrEmpty(Service)) sb.Append(" --service ").Append(Q(Service));
            if (!string.IsNullOrEmpty(Verb)) sb.Append(" --verb ").Append(Q(Verb));
            if (!string.IsNullOrEmpty(Id)) sb.Append(" --id ").Append(Q(Id));
            sb.Append(" --account ").Append(Q(string.IsNullOrEmpty(Account) ? originalUser : Account));
            sb.Append(" --by ").Append(Q(string.IsNullOrEmpty(By) ? originalUser : By));
            if (Json) sb.Append(" --json");
            if (All) sb.Append(" --all");
            if (Once) sb.Append(" --once");
            return sb.ToString();
        }

        static string Q(string s) { return "\"" + s.Replace("\"", "") + "\""; }
    }
}
