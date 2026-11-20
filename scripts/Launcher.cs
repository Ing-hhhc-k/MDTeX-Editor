using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using System.Reflection;
using System.Text;
[assembly: AssemblyVersion("0.4.3.0")]
[assembly: AssemblyFileVersion("0.4.3.0")]
[assembly: AssemblyProduct("MDTeX Editor")]
internal static class Launcher {
  private static string Quote(string value) {
    var result=new StringBuilder("\"");int slashes=0;
    foreach(char c in value){if(c=='\\'){slashes++;continue;}if(c=='"'){result.Append('\\',slashes*2+1);result.Append(c);}else{result.Append('\\',slashes);result.Append(c);}slashes=0;}
    result.Append('\\',slashes*2);result.Append('"');return result.ToString();
  }
  [STAThread]
  private static int Main(string[] args) {
    string home=AppDomain.CurrentDomain.BaseDirectory;
    string[] candidates={Path.Combine(home,"_internal","MDTeX.exe"),Path.Combine(home,"release","MDTeX","_internal","MDTeX.exe")};
    foreach(string file in candidates) {
      if(!File.Exists(file))continue;
      try {
        // Keep the caller's cwd for the existing test and document context.
        var info=new ProcessStartInfo(file);
        info.UseShellExecute=false;
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
