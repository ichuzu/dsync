// dsync-helper: answers Windows questions for the Dsync main process over
// stdin/stdout, one line per request, so Dsync never has to spawn reg.exe,
// tasklist.exe or PowerShell on a timer.
//
//   get                 -> foreground window handle
//   set <handle>        -> bring that window to the front ("ok")
//   reg <key>|<value>   -> a registry value under HKEY_CURRENT_USER, or ""
//   procs               -> running process names (no ".exe"), "|"-separated
//
// Compiled at build time by scripts/build-electron.mjs with the C# compiler
// that ships with Windows (.NET Framework 4.x), so it needs no runtime install.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32;

static class DsyncHelper
{
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

    static string Handle(string line)
    {
        if (line == "get") return GetForegroundWindow().ToInt64().ToString();

        if (line.StartsWith("set "))
        {
            IntPtr h = new IntPtr(long.Parse(line.Substring(4)));
            if (IsWindow(h))
            {
                if (IsIconic(h)) ShowWindow(h, 9);
                // Windows only lets the foreground process move focus; a tapped
                // Alt key lifts that lock for this call.
                keybd_event(0x12, 0, 0, UIntPtr.Zero);
                keybd_event(0x12, 0, 2, UIntPtr.Zero);
                SetForegroundWindow(h);
            }
            return "ok";
        }

        if (line.StartsWith("reg "))
        {
            string[] parts = line.Substring(4).Split('|');
            if (parts.Length != 2) return "";
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(parts[0]))
            {
                object value = key == null ? null : key.GetValue(parts[1]);
                return value == null ? "" : value.ToString();
            }
        }

        if (line == "procs")
        {
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (Process p in Process.GetProcesses())
            {
                names.Add(p.ProcessName);
                p.Dispose();
            }
            return string.Join("|", names);
        }

        return "";
    }

    static void Main()
    {
        string line;
        while ((line = Console.ReadLine()) != null)
        {
            string answer;
            try { answer = Handle(line.Trim()); }
            catch { answer = ""; }
            Console.Out.WriteLine(answer);
            Console.Out.Flush();
        }
    }
}
