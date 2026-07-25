// jondash-elevate — the per-action elevate shim (OPS-18, part 2).
//
// Performs ONE elevated action, reports what happened, and exits. Nothing persists. See
// JonDash-addons/helpers/ELEVATION.md and docs/ROADMAP.md § OPS-18.
//
// WHY THIS CANNOT REUSE THE GRANT MODEL, AND IS WEAKER FOR IT
// A grant is safe because the action is frozen when the admin approves it: the service and verb
// are baked into a Scheduled Task, and `schtasks /run` cannot pass arguments, so Windows itself
// guarantees that what was approved is the only thing that can happen. An install has a variable
// part — the package — so there is nothing to freeze. Pre-creating a task per package is
// pointless, and a task that reads the package from a file is a local privilege escalation for
// anything that can write that file.
//
// So installs prompt every time. That is a property of the action, not a preference, and it
// makes this shim a genuinely weaker security story than the grant manager. Be honest about it.
//
// WHAT ACTUALLY PROTECTS THE ADMIN HERE
// Not UAC: the prompt names THIS binary and says nothing about the package. UAC proves a human
// is present, not that they understood. **JonDash's own screen is the real consent surface** and
// must show the package verbatim.
//
// What this binary contributes is a BOUND on the blast radius. The only expressible action is
// "install/uninstall a named package from the official winget source at its current version".
// A fully compromised JonDash can therefore ask for things in the winget catalogue and nothing
// else. Every one of these would break that, and none may ever be accepted or forwarded:
//
//   --custom / --override   pass arbitrary arguments to the vendor's installer  → arbitrary code
//   --manifest              install from a local file                           → arbitrary code
//   --version               pin an old build                                    → downgrade attack
//   --location              write the payload somewhere chosen by the caller
//   a caller-supplied path to winget itself                                     → arbitrary exe
//
// The residual risk that cannot be engineered away: an installer runs the vendor's code as
// administrator by definition. "Install Docker" means "run Docker Inc's installer as admin".
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;

static class Program
{
    // Shared vocabulary with jondash-grant and lib/elevation.ts. Declined must never be
    // reported as a failure — different meaning, different retry policy.
    const int ExitOk = 0;
    const int ExitUsage = 2;
    const int ExitFailed = 3;
    const int ExitNoDesktop = 4;
    const int ExitNotFound = 5;   // no such package in the source
    const int ExitAlready = 6;    // already in the requested state; nothing was done
    const int ExitNoManager = 7;  // winget isn't present on this machine
    const int ExitDeclined = 1223;

    static int Main(string[] args)
    {
        try { return Run(args); }
        catch (Exception ex) { Console.Error.WriteLine("error: " + ex.Message); return ExitFailed; }
    }

    static int Run(string[] args)
    {
        var a = Args.Parse(args);
        if (a.Bad) return ExitUsage;
        if (a.Action == null || a.Action == "help") { Usage(); return a.Action == null ? ExitUsage : ExitOk; }

        // Only winget for now. An unknown manager is rejected rather than ignored, so the
        // grammar can grow later without a caller silently getting the wrong one.
        if (a.Manager != "winget")
        {
            Console.Error.WriteLine("error: --manager must be winget (the only one implemented)");
            return ExitUsage;
        }
        if (!ValidPackage(a.Package))
        {
            Console.Error.WriteLine(
                "error: --package must look like Publisher.Name — letters, digits and . _ + - only, " +
                "and it may not begin with '-'. Rejected: \"" + (a.Package ?? "") + "\"");
            return ExitUsage;
        }

        string winget = FindWinget();
        if (winget == null)
        {
            Console.Error.WriteLine("error: winget is not available on this machine. Install App Installer " +
                                    "from the Microsoft Store, or install the package by hand.");
            return ExitNoManager;
        }

        // `status` is a READ and needs no elevation — so it never prompts. This is what lets a
        // caller poll for progress while an install runs, without a prompt per poll.
        if (a.Action == "status") return Status(winget, a.Package);

        int relaunch;
        if (!Elevate.Ensure(a, out relaunch)) return relaunch;

        return a.Action == "install" ? Install(winget, a.Package) : Uninstall(winget, a.Package);
    }

    // ------------------------------------------------------------------ actions

    static int Status(string winget, string pkg)
    {
        var r = Exec(winget, new[] { "list", "--exact", "--id", pkg, "--source", "winget",
                                     "--accept-source-agreements", "--disable-interactivity" });
        bool installed = r.code == 0 && r.stdout.IndexOf(pkg, StringComparison.OrdinalIgnoreCase) >= 0;
        Console.WriteLine(installed ? "installed" : "not-installed");
        return ExitOk;
    }

    static int Install(string winget, string pkg)
    {
        // Every flag here is fixed. Nothing from the caller reaches this array except the
        // package id, which has already been charset-checked and cannot begin with '-'.
        var r = Exec(winget, new[]
        {
            "install", "--exact", "--id", pkg,
            "--source", "winget",              // official repo only; a caller cannot add a source
            "--accept-package-agreements",     // unattended: there is nobody to click through EULAs
            "--accept-source-agreements",
            "--disable-interactivity",         // never sit waiting for input with no console
            "--silent",
        });
        return MapWinget(r, "install");
    }

    static int Uninstall(string winget, string pkg)
    {
        var r = Exec(winget, new[]
        {
            "uninstall", "--exact", "--id", pkg,
            "--accept-source-agreements", "--disable-interactivity", "--silent",
        });
        return MapWinget(r, "uninstall");
    }

    /**
     * winget's exit codes are HRESULTs. Only the few a caller can act on differently are mapped;
     * everything else is an honest "failed" rather than a guess.
     */
    static int MapWinget(ExecResult r, string what)
    {
        const uint NO_APPLICABLE_INSTALLER = 0x8A150102;
        const uint NO_PACKAGES_FOUND = 0x8A150014;
        const uint ALREADY_INSTALLED = 0x8A150061;
        const uint NOT_INSTALLED = 0x8A150064;

        uint hr = unchecked((uint)r.code);
        if (r.code == 0) { Console.WriteLine(what + " ok"); return ExitOk; }
        if (hr == NO_PACKAGES_FOUND) { Console.Error.WriteLine("error: no such package"); return ExitNotFound; }
        if (hr == ALREADY_INSTALLED || hr == NOT_INSTALLED)
        {
            Console.Error.WriteLine("nothing to do: already in the requested state");
            return ExitAlready;
        }
        if (hr == NO_APPLICABLE_INSTALLER)
        {
            Console.Error.WriteLine("error: no installer for this machine's architecture");
            return ExitFailed;
        }
        Console.Error.WriteLine("error: winget " + what + " failed (0x" + hr.ToString("x8") + ")");
        return ExitFailed;
    }

    // ------------------------------------------------------------------ winget

    /**
     * Find winget OURSELVES. A caller-supplied path would be arbitrary executable execution as
     * administrator, which is the whole thing this design refuses.
     *
     * It normally arrives as an app-execution alias on PATH. Under elevation the elevated
     * account's PATH is searched, which is why this can legitimately fail even when winget works
     * unelevated — reported plainly rather than worked around.
     */
    static string FindWinget()
    {
        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var dir in path.Split(';'))
        {
            if (dir.Length == 0) continue;
            string candidate;
            try { candidate = Path.Combine(dir.Trim(), "winget.exe"); } catch { continue; }
            if (File.Exists(candidate)) return candidate;
        }
        // WindowsApps holds the alias; check the current user's copy as a fallback.
        try
        {
            string local = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Microsoft", "WindowsApps", "winget.exe");
            if (File.Exists(local)) return local;
        }
        catch { }
        return null;
    }

    struct ExecResult { public int code; public string stdout; public string stderr; }

    static ExecResult Exec(string exe, string[] argv)
    {
        var psi = new ProcessStartInfo(exe)
        {
            UseShellExecute = false,      // no shell: argv is passed through, never re-parsed
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        foreach (var s in argv) psi.Arguments += (psi.Arguments.Length > 0 ? " " : "") + Quote(s);

        using (var p = Process.Start(psi))
        {
            string o = p.StandardOutput.ReadToEnd();
            string e = p.StandardError.ReadToEnd();
            p.WaitForExit();
            return new ExecResult { code = p.ExitCode, stdout = o, stderr = e };
        }
    }

    static string Quote(string s) { return s.IndexOf(' ') >= 0 ? "\"" + s.Replace("\"", "") + "\"" : s; }

    // -------------------------------------------------------------- validation

    static readonly Regex PackageShape = new Regex(@"^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$", RegexOptions.Compiled);

    /**
     * winget ids look like `Docker.DockerDesktop`. The charset is narrow on purpose, and the
     * leading-character rule is the one that matters: an id beginning with '-' would be read by
     * winget as a FLAG, which is how `--custom` or `--override` could be smuggled in as a
     * "package name" and turned into arbitrary code as administrator.
     */
    static bool ValidPackage(string pkg)
    {
        return !string.IsNullOrEmpty(pkg) && PackageShape.IsMatch(pkg);
    }

    static void Usage()
    {
        Console.WriteLine(@"jondash-elevate — perform ONE elevated package action, then exit.

  --action install   --manager winget --package <Publisher.Name>
  --action uninstall --manager winget --package <Publisher.Name>
  --action status    --manager winget --package <Publisher.Name>   (no elevation, never prompts)

Installs and uninstalls prompt for elevation EVERY time — an install has a variable part, so
there is nothing fixed to grant once. Nothing persists after this exits.

The package is installed from the official winget source at its current version. There is
deliberately no way to pass installer arguments, a manifest, a version or a path.

Exit: 0 ok · 2 usage · 3 failed · 4 no interactive desktop · 5 no such package ·
      6 already in that state · 7 winget unavailable · 1223 declined at the prompt.");
    }

    // -------------------------------------------------------------- elevation

    static class Elevate
    {
        public static bool IsElevated()
        {
            try { return new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator); }
            catch { return false; }
        }

        /** Identical contract to jondash-grant: refuse where it cannot prompt, never degrade. */
        public static bool Ensure(Args a, out int exitCode)
        {
            exitCode = 0;
            if (IsElevated()) return true;

            if (!Environment.UserInteractive || Process.GetCurrentProcess().SessionId == 0)
            {
                Console.Error.WriteLine(
                    "error: this action needs an interactive desktop to show the elevation prompt, and " +
                    "this process has none (Session 0, a container, or headless). Nothing was changed.");
                exitCode = ExitNoDesktop;
                return false;
            }

            var si = new SHELLEXECUTEINFO();
            si.cbSize = Marshal.SizeOf(si);
            si.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NO_CONSOLE;
            si.lpVerb = "runas";
            si.lpFile = Process.GetCurrentProcess().MainModule.FileName;
            si.lpParameters = a.Rebuild();
            si.nShow = SW_HIDE;

            if (!ShellExecuteEx(ref si))
            {
                int err = Marshal.GetLastWin32Error();
                if (err == ERROR_CANCELLED)
                {
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
            return false;
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

    // ------------------------------------------------------------------- args

    sealed class Args
    {
        public string Action, Manager, Package;
        public bool Bad;

        public static Args Parse(string[] argv)
        {
            var a = new Args();
            for (int i = 0; i < argv.Length; i++)
            {
                switch (argv[i])
                {
                    case "--action": a.Action = Next(argv, ref i, a); break;
                    case "--manager": a.Manager = Next(argv, ref i, a); break;
                    case "--package": a.Package = Next(argv, ref i, a); break;
                    case "--help": case "-h": case "/?": a.Action = "help"; break;
                    default:
                        // Unknown flags are REFUSED, never ignored. Silently dropping one is how a
                        // caller ends up believing it constrained something that it did not.
                        Console.Error.WriteLine("error: unknown argument \"" + argv[i] + "\"");
                        a.Bad = true;
                        return a;
                }
                if (a.Bad) return a;
            }
            if (a.Action != null && a.Action != "help" &&
                a.Action != "install" && a.Action != "uninstall" && a.Action != "status")
            {
                Console.Error.WriteLine("error: --action must be install, uninstall or status");
                a.Bad = true;
            }
            return a;
        }

        static string Next(string[] argv, ref int i, Args a)
        {
            if (i + 1 >= argv.Length)
            {
                Console.Error.WriteLine("error: missing value after " + argv[i]);
                a.Bad = true;
                return null;
            }
            return argv[++i];
        }

        /** Rebuilt for the elevated relaunch. Only the three known fields — nothing passes through. */
        public string Rebuild()
        {
            var sb = new StringBuilder();
            sb.Append("--action ").Append(Action);
            sb.Append(" --manager ").Append(Manager);
            sb.Append(" --package ").Append(Package);
            return sb.ToString();
        }
    }
}
