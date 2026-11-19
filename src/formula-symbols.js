export const symbols = {
  括号: [['左大括号','\\{'],['右大括号','\\}'],['大括号一对','\\left\\{ x \\right\\}'],['左圆括号','('],['右圆括号',')'],['左方括号','['],['右方括号',']'],['绝对值','\\left|x\\right|'],['左尖括号','\\langle'],['右尖括号','\\rangle']],
  希腊字母: ['alpha','beta','gamma','delta','epsilon','varepsilon','zeta','eta','theta','vartheta','iota','kappa','lambda','mu','nu','xi','pi','rho','sigma','tau','upsilon','phi','varphi','chi','psi','omega','Gamma','Delta','Theta','Lambda','Xi','Pi','Sigma','Phi','Psi','Omega'].map(s=>[s,'\\'+s+' ']),
  常用字符: [['无穷','\\infty '],['偏导','\\partial '],['梯度','\\nabla '],['正负','\\pm '],['乘号','\\times '],['点乘','\\cdot '],['不等于','\\neq '],['小于等于','\\leq '],['大于等于','\\geq '],['属于','\\in '],['实数集','\\mathbb{R}'],['自然数集','\\mathbb{N}'],['复数集','\\mathbb{C}'],['任意','\\forall '],['存在','\\exists '],['右箭头','\\rightarrow ']],
}
