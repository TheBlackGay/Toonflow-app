using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

internal static class checkRunning
{
    [DllImport("kernel32.dll", EntryPoint = "OpenProcess", SetLastError = true)]
    private static extern IntPtr openProcess(uint access, bool inherit, int processId);

    [DllImport("kernel32.dll", EntryPoint = "QueryFullProcessImageNameW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool queryProcessImageName(IntPtr process, uint flags, StringBuilder path, ref uint size);

    [DllImport("kernel32.dll", EntryPoint = "CloseHandle")]
    private static extern bool closeHandle(IntPtr handle);

    [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle openFile(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);

    [DllImport("kernel32.dll", EntryPoint = "GetFinalPathNameByHandleW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint getFinalPathName(SafeFileHandle file, StringBuilder path, uint size, uint flags);

    private static string getFinalPath(string path)
    {
        using (SafeFileHandle file = openFile(path, 0, 7, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero))
        {
            if (file.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
            StringBuilder result = new StringBuilder(32768);
            uint length = getFinalPathName(file, result, (uint)result.Capacity, 0);
            if (length == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
            if (length >= result.Capacity) throw new IOException("Executable path is too long.");
            return result.ToString().TrimEnd('\\');
        }
    }

    private static int Main(string[] args)
    {
        try
        {
            if (args.Length != 1) throw new ArgumentException("Expected the installation directory.");
            string appDirectory = Path.Combine(Path.GetFullPath(args[0]), "app");
            try
            {
                if ((File.GetAttributes(appDirectory) & FileAttributes.Directory) == 0)
                    throw new IOException("The app path is not a directory.");
            }
            catch (FileNotFoundException) { return 0; }
            catch (DirectoryNotFoundException) { return 0; }

            string appPrefix = getFinalPath(appDirectory) + "\\";
            HashSet<string> processNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string file in Directory.EnumerateFiles(appDirectory, "*.exe", SearchOption.AllDirectories))
                processNames.Add(Path.GetFileNameWithoutExtension(file));

            // NSIS 外层检查超时为 15 秒，预留进程启动与输出的余量。
            DateTime deadline = DateTime.UtcNow.AddSeconds(10);
            while (true)
            {
                string running = null;
                foreach (string processName in processNames)
                {
                    foreach (Process process in Process.GetProcessesByName(processName))
                    {
                        using (process)
                        {
                            IntPtr handle = openProcess(0x1000, false, process.Id);
                            if (handle == IntPtr.Zero)
                            {
                                int errorCode = Marshal.GetLastWin32Error();
                                if (errorCode == 87) continue; // 进程在枚举后已退出。
                                throw new Win32Exception(errorCode, "Cannot inspect " + processName + " (PID " + process.Id + ").");
                            }
                            try
                            {
                                StringBuilder imagePath = new StringBuilder(32768);
                                uint size = (uint)imagePath.Capacity;
                                if (!queryProcessImageName(handle, 0, imagePath, ref size))
                                {
                                    int errorCode = Marshal.GetLastWin32Error();
                                    if (process.HasExited) continue;
                                    throw new Win32Exception(errorCode);
                                }
                                if (getFinalPath(imagePath.ToString()).StartsWith(appPrefix, StringComparison.OrdinalIgnoreCase))
                                {
                                    running = processName + " (PID " + process.Id + ")";
                                    break;
                                }
                            }
                            finally { closeHandle(handle); }
                        }
                    }
                    if (running != null) break;
                }
                if (running == null) return 0;
                if (DateTime.UtcNow >= deadline)
                {
                    Console.WriteLine(running);
                    return 1;
                }
                // 关闭窗口后宿主和渲染进程可能需要几秒钟释放应用文件，给它们一个有界退出窗口。
                System.Threading.Thread.Sleep(250);
            }
        }
        catch (Exception error)
        {
            Console.WriteLine("Running process check failed: " + error.Message);
            return 2;
        }
    }
}
