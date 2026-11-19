# MDTeX Editor 后续规划

项目命名中的 **MD** 指 Markdown，**TeX** 为后续 LaTeX 阅读与编辑预留。

## 记录的设想，尚未列入当前开发范围

- 支持 `.tex` 文档的阅读和源码编辑。
- 研究 LaTeX 文档编译、错误提示及 PDF 预览。
- 在同一工作空间中管理 Markdown 和 LaTeX 文档及其资源。

当前仅实现 Markdown 编辑器及 KaTeX 数学公式渲染。`.tex` 与其他非 Markdown 文件在文件夹树中仅展示，不读取、不编辑、不编译。后续是否接入本机 TeX 发行版、具体交互与编译方案，待实际需求明确后决定。
