# XiaoHei-H3 精修（Open-H3 Regenerate 2K）：本目录含 8 个节点的实现。
#
#   xh_openh3_input.py    视频预处理（CFR24 / 几何对齐 / 抽音轨）
#   xh_openh3_prompt.py   提示词编码（编完卸载 32B 编码器）
#   xh_openh3_refine.py   精修总控（内部串起整条模型链，跑完卸载）
#   xh_openh3_decode.py   低内存解码（返回缓冲降 fp16）
#   xh_openh3_tiled.py    分块扩散（每个去噪步切块跑 DiT 再混合）
#   xh_openh3_regen.py    模型补丁 / 官方 sigma / 锁定音频（三个独立节点）
#   xh_openh3_patch.py    上述三者的算法层（纯函数，零第三方节点包依赖）
#   media_prepare.py      CPU 预处理实现
#   media_probe.py        有界子进程媒体探测（防解码阻塞）
