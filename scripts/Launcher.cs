using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using System.Reflection;
using System.Text;
[assembly: AssemblyVersion("0.5.5.0")]
[assembly: AssemblyFileVersion("0.5.5.0")]
[assembly: AssemblyProduct("MDTeX Editor")]
internal static class Launcher {
  private static void UpdateLog(string home,string message) {try{File.AppendAllText(Path.Combine(home,"runner.log"),message);}catch{}}
  private static string Quote(string value) {
    var result=new StringBuilder("\"");int slashes=0;
    foreach(char c in value){if(c=='\\'){slashes++;continue;}if(c=='"'){result.Append('\\',slashes*2+1);result.Append(c);}else{result.Append('\\',slashes);result.Append(c);}slashes=0;}
    result.Append('\\',slashes*2);result.Append('"');return result.ToString();
  }
  [STAThread]
  private static int Main(string[] args) {
    string home=AppDomain.CurrentDomain.BaseDirectory;
    // Run updates from a copied, windowless launcher so the worker survives
    // closing Electron and never holds the program directory open.
    if(args.Length==2 && args[0]=="--apply-update") {
      try {
        string plan=Path.GetFullPath(args[1]);
        if(!String.Equals(Path.GetDirectoryName(plan).TrimEnd('\\'),home.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase))return 1;
        string script=Path.Combine(home,"apply.ps1");
        string command="& ([scriptblock]::Create([IO.File]::ReadAllText('"+script.Replace("'","''")+"',[Text.Encoding]::UTF8))) -PlanFile '"+plan.Replace("'","''")+"'";
        var worker=new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"WindowsPowerShell","v1.0","powershell.exe"));
        worker.Arguments="-NoProfile -NonInteractive -EncodedCommand "+Convert.ToBase64String(Encoding.Unicode.GetBytes(command));
        worker.UseShellExecute=false;worker.CreateNoWindow=true;worker.WindowStyle=ProcessWindowStyle.Hidden;
        worker.RedirectStandardError=true;worker.RedirectStandardOutput=true;
        using(var process=new Process()) {
          var logs=new StringBuilder();DataReceivedEventHandler append=(sender,e)=>{if(e.Data!=null){lock(logs){logs.AppendLine(e.Data);}}};
          process.StartInfo=worker;process.OutputDataReceived+=append;process.ErrorDataReceived+=append;process.Start();
          process.BeginOutputReadLine();process.BeginErrorReadLine();process.WaitForExit();UpdateLog(home,logs.ToString());return process.ExitCode;
        }
      } catch(Exception error) {UpdateLog(home,error.ToString());return 1;}
    }
    string[] candidates={Path.Combine(home,"_internal","MDTeX.exe"),Path.Combine(home,"release","MDTeX","_internal","MDTeX.exe")};
    foreach(string file in candidates) {
      if(!File.Exists(file))continue;
      try {
        // Keep the caller's cwd for the existing test and document context.
        var info=new ProcessStartInfo(file);
        info.UseShellExecute=false;
        info.EnvironmentVariables["MDTEX_PORTABLE_ROOT"]=home;
        var arguments=new string[args.Length];bool debug=false;
        for(int i=0;i<args.Length;i++){arguments[i]=Quote(args[i]);if(args[i].StartsWith("--inspect"))debug=true;}
        info.Arguments=String.Join(" ",arguments);
        if(debug){info.RedirectStandardError=true;info.RedirectStandardOutput=true;}
        using(var process=new Process()) {
          process.StartInfo=info;
          if(debug){process.ErrorDataReceived+=(sender,e)=>{if(e.Data!=null)Console.Error.WriteLine(e.Data);};process.OutputDataReceived+=(sender,e)=>{if(e.Data!=null)Console.WriteLine(e.Data);};}
          process.Start();
          if(debug){process.BeginErrorReadLine();process.BeginOutputReadLine();process.WaitForExit();return process.ExitCode;}
        }
        return 0;
      } catch(Exception error) {MessageBox.Show(error.Message,"MDTeX 启动失败");return 1;}
    }
    MessageBox.Show("未找到运行文件。请将完整 Windows 免安装压缩包解压后启动，不要只复制 exe。\n\n如果下载的是项目源代码，请先运行 npm install 和 npm run dist。","MDTeX Editor");
    return 1;
  }
}
