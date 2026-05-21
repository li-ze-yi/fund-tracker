import React, { useState, useCallback } from 'react';

interface VisualCountdownShowcaseProps {
  countdown: number;
  refreshFreq: number;
  refreshing: boolean;
  progressPercent: number;
  onRefresh: () => void;
}

interface VisualStyleConfig {
  name: string;
  description: string;
  type: string;
  visualMetaphor: string; // 视觉隐喻说明
}

const visualStyles: VisualStyleConfig[] = [
  {
    name: '🌊 涟漪扩散',
    description: '水波从中心向外扩散，波纹间距表示剩余时间',
    type: 'ripple-spread',
    visualMetaphor: '像石子投入平静的水面'
  },
  {
    name: '🔥 火焰燃烧',
    description: '火焰高度和跳动频率随时间变化',
    type: 'flame-burn',
    visualMetaphor: '时间如火焰般燃烧殆尽'
  },
  {
    name: '⚡ 能量充能',
    description: '能量环逐渐填充发光，充满时闪烁',
    type: 'energy-charge',
    visualMetaphor: '像超级英雄的能量槽'
  },
  {
    name: '🌸 花朵绽放',
    description: '花瓣层层展开，开放程度代表进度',
    type: 'flower-bloom',
    visualMetaphor: '时间的花朵在绽放'
  },
  {
    name: '💫 星轨旋转',
    description: '星星沿轨道旋转，速度暗示紧迫感',
    type: 'star-orbit',
    visualMetaphor: '宇宙星辰的运行轨迹'
  },
  {
    name: '🎯 靶心收缩',
    description: '同心圆向中心收缩，即将归零',
    type: 'target-shrink',
    visualMetaphor: '射箭靶心的倒计时'
  },
  {
    name: '🌈 彩虹渐变',
    description: '颜色沿光谱循环，色相位置指示时间',
    type: 'rainbow-cycle',
    visualMetaphor: '时间的色彩流转'
  },
  {
    name: '❤️ 心跳脉动',
    description: '心跳频率随时间加快，模拟紧张感',
    type: 'heartbeat-pulse',
    visualMetaphor: '生命的心跳节奏'
  },
  {
    name: '🌀 漩涡吸入',
    description: '漩涡旋转并逐渐增强，产生紧迫感',
    type: 'vortex-swirl',
    visualMetaphor: '被时间漩涡吞噬'
  },
  {
    name: '🎵 音波律动',
    description: '音频波形跳动，振幅反映剩余时长',
    type: 'soundwave',
    visualMetaphor: '时间的音乐节拍'
  },
  {
    name: '🧊 冰块融化',
    description: '冰块逐渐变小并滴水，直观表现消耗',
    type: 'ice-melt',
    visualMetaphor: '时间如冰雪消融'
  },
  {
    name: '🌙 月相变化',
    description: '月亮从满月到新月，周期性变化',
    type: 'moon-phase',
    visualMetaphor: '阴晴圆缺的时间循环'
  },
  {
    name: '⏳ 沙漏流动',
    description: '沙子从上到下流动，经典时间隐喻',
    type: 'hourglass-flow',
    visualMetaphor: '沙漏中的时光流逝'
  },
  {
    name: '🎪 马戏团气球',
    description: '气球缓慢泄气变小，趣味化表达',
    type: 'balloon-deflate',
    visualMetaphor: '时间像气球一样流失'
  },
  {
    name: '🔮 水晶球占卜',
    description: '迷雾逐渐消散，揭示内部光芒',
    type: 'crystal-ball',
    visualMetaphor: '透过水晶看透时间'
  },
  {
    name: '🎰 老虎机滚动',
    description: '符号快速滚动后减速停止',
    type: 'slot-spin',
    visualMetaphor: '命运的轮盘转动'
  }
];

const VisualCountdownShowcase: React.FC<VisualCountdownShowcaseProps> = ({
  countdown,
  refreshFreq,
  refreshing,
  progressPercent,
  onRefresh
}) => {
  const [interactionKey, setInteractionKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setInteractionKey(prev => prev + 1);
    onRefresh();
  }, [onRefresh]);

  // 计算时间紧迫度 (0-1)
  const urgency = 1 - (countdown / refreshFreq);
  const isUrgent = countdown <= 5;

  // ==================== 1. 🌊 涟漪扩散 ====================
  const renderRippleSpread = () => (
    <div style={styles_common.container}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        {/* 多层涟漪 - 从内到外 */}
        {[3, 2, 1, 0].map((i) => {
          const baseRadius = 15 + i * 20;
          const maxRadius = 55;
          const currentRadius = baseRadius + (maxRadius - baseRadius) * (progressPercent / 100);
          const opacity = 0.8 - i * 0.15;

          return (
            <circle
              key={i}
              cx="60"
              cy="60"
              r={currentRadius}
              fill="none"
              stroke={`rgba(0, 150, 255, ${opacity})`}
              strokeWidth="2"
              style={{
                filter: `drop-shadow(0 0 ${4 + i * 2}px rgba(0, 150, 255, ${opacity * 0.6}))`,
                transition: `r ${0.5 + i * 0.2}s ease-out`
              }}
            />
          );
        })}

        {/* 中心点 */}
        <circle
          cx="60"
          cy="60"
          r={isUrgent ? 8 : 5}
          fill="#00d4ff"
          style={{
            filter: 'drop-shadow(0 0 10px #00d4ff)',
            animation: isUrgent ? 'pulse-core-urgent 0.5s infinite' : 'pulse-gentle 2s infinite'
          }}
        />
      </svg>
    </div>
  );

  // ==================== 2. 🔥 火焰燃烧 ====================
  const renderFlameBurn = () => (
    <div style={styles_common.container}>
      <svg width="100" height="120" viewBox="0 0 100 120">
        {/* 外焰 */}
        <path
          d={`M 50 ${110 - progressPercent * 0.8}
                 Q ${35 + Math.sin(Date.now() / 200) * 5} ${90 - progressPercent * 0.3}
                 Q ${45 + Math.sin(Date.now() / 150) * 8} ${70 - progressPercent * 0.2}
                 Q 50 ${50 - progressPercent * 0.1}
                 Q ${55 + Math.cos(Date.now() / 180) * 8} ${70 - progressPercent * 0.2}
                 Q ${65 + Math.cos(Date.now() / 220) * 5} ${90 - progressPercent * 0.3}
                 Q 50 ${110 - progressPercent * 0.8}
                 Z`}
          fill="url(#flameGradient)"
          opacity="0.7"
          style={{
            animation: `flame-dance ${isUrgent ? 0.3 : 0.6}s ease-in-out infinite`,
            transformOrigin: 'center bottom'
          }}
        />

        {/* 内焰 */}
        <path
          d={`M 50 ${105 - progressPercent * 0.6}
                 Q ${42 + Math.sin(Date.now() / 180) * 3} ${88 - progressPercent * 0.2}
                 Q 50 ${72 - progressPercent * 0.1}
                 Q ${58 + Math.cos(Date.now() / 200) * 3} ${88 - progressPercent * 0.2}
                 Z`}
          fill="url(#flameInnerGradient)"
          opacity="0.9"
          style={{
            animation: `flame-dance ${isUrgent ? 0.25 : 0.5}s ease-in-out infinite reverse`,
            transformOrigin: 'center bottom'
          }}
        />

        {/* 底部燃料（逐渐减少） */}
        <ellipse
          cx="50"
          cy="112"
          rx={30 - progressPercent * 0.2}
          ry={6 - progressPercent * 0.03}
          fill="#ff6b35"
          opacity="0.9"
        />

        <defs>
          <linearGradient id="flameGradient" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#ff6b35" />
            <stop offset="50%" stopColor="#ff8c42" />
            <stop offset="100%" stopColor="#ffd93d" />
          </linearGradient>
          <linearGradient id="flameInnerGradient" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#fff176" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>
        </defs>

        {/* 火花粒子 */}
        {!refreshing && [...Array(5)].map((_, i) => (
          <circle
            key={i}
            cx={40 + i * 5 + Math.sin(Date.now() / (300 + i * 50)) * 10}
            cy={80 - progressPercent * 0.5 - i * 8}
            r={2 + Math.random()}
            fill="#ffd93d"
            opacity={0.8 - i * 0.12}
            style={{
              animation: `spark-rise ${0.8 + i * 0.2}s ease-out infinite`,
              animationDelay: `${i * 0.15}s`
            }}
          />
        ))}
      </svg>
    </div>
  );

  // ==================== 3. ⚡ 能量充能 ====================
  const renderEnergyCharge = () => (
    <div style={styles_common.container}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        {/* 外圈能量环 */}
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke="rgba(138, 43, 226, 0.2)"
          strokeWidth="12"
        />
        
        {/* 填充的能量弧 */}
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke="url(#energyGradient)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${progressPercent * 3.27} 327`}
          transform="rotate(-90 60 60)"
          style={{
            filter: `drop-shadow(0 0 ${isUrgent ? 15 : 8}px rgba(167, 139, 250, 0.8))`,
            transition: 'stroke-dasharray 0.5s ease'
          }}
        />

        {/* 内部能量核心 */}
        <circle
          cx="60"
          cy="60"
          r="30"
          fill="url(#energyCoreGradient)"
          opacity={0.3 + progressPercent * 0.007}
          style={{
            filter: `drop-shadow(0 0 ${20 + progressPercent * 0.3}px rgba(167, 139, 250, ${0.4 + progressPercent * 0.004}))`,
            animation: isUrgent ? 'energy-pulse-fast 0.5s infinite' : 'energy-pulse 2s infinite'
          }}
        />

        {/* 能量粒子环绕 */}
        {[...Array(8)].map((_, i) => {
          const angle = (i * 45 + Date.now() / 50) * Math.PI / 180;
          const radius = 38 + Math.sin(Date.now() / 500 + i) * 3;
          const x = 60 + radius * Math.cos(angle);
          const y = 60 + radius * Math.sin(angle);

          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={3 + Math.sin(Date.now() / 300 + i * 0.5) * 1}
              fill="#a78bfa"
              opacity="0.9"
              style={{
                filter: 'drop-shadow(0 0 6px #a78bfa)'
              }}
            />
          );
        })}

        <defs>
          <linearGradient id="energyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
          <radialGradient id="energyCoreGradient">
            <stop offset="0%" stopColor="#c084fc" />
            <stop offset="100%" stopColor="#7c3aed" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );

  // ==================== 4. 🌸 花朵绽放 ====================
  const renderFlowerBloom = () => (
    <div style={styles_common.container}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        {/* 花瓣 - 从外到内共3层 */}
        {[0, 1, 2].map((layer) => {
          const petalCount = 6 + layer * 2;
          const baseSize = 18 - layer * 4;
          const bloomFactor = Math.min(1, progressPercent / (33 * (layer + 1)));
          const size = baseSize * bloomFactor;

          return [...Array(petalCount)].map((_, i) => {
            const angle = (i * 360 / petalCount + layer * 15) * Math.PI / 180;
            const distance = 20 + layer * 15;
            const x = 65 + distance * Math.cos(angle);
            const y = 65 + distance * Math.sin(angle);

            const hue = (layer * 40 + i * 15) % 360;

            return (
              <ellipse
                key={`${layer}-${i}`}
                cx={x}
                cy={y}
                rx={size}
                ry={size * 1.3}
                fill={`hsla(${hue}, 85%, 75%, ${0.7 - layer * 0.15})`}
                transform={`rotate(${angle * 180 / Math.PI + 90}, ${x}, ${y})`}
                style={{
                  filter: `drop-shadow(0 0 ${4 + layer * 2}px hsla(${hue}, 85%, 75%, 0.5))`,
                  transition: `rx 0.8s ease-out, ry 0.8s ease-out`
                }}
              />
            );
          });
        })}

        {/* 花蕊 */}
        <circle
          cx="65"
          cy="65"
          r={8 + progressPercent * 0.04}
          fill="#ffd93d"
          style={{
            filter: 'drop-shadow(0 0 10px #ffd93d)',
            animation: 'flower-center-pulse 2s infinite'
          }}
        />

        {/* 花蕊细节 */}
        {[...Array(8)].map((_, i) => {
          const angle = (i * 45) * Math.PI / 180;
          const dist = 4;
          return (
            <circle
              key={i}
              cx={65 + dist * Math.cos(angle)}
              cy={65 + dist * Math.sin(angle)}
              r="1.5"
              fill="#ff8c42"
            />
          );
        })}
      </svg>
    </div>
  );

  // ==================== 5. 💫 星轨旋转 ====================
  const renderStarOrbit = () => (
    <div style={styles_common.container}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        {/* 3条轨道 */}
        {[48, 36, 24].map((radius, ringIndex) => (
          <g key={ringIndex}>
            {/* 轨道线 */}
            <circle
              cx="65"
              cy="65"
              r={radius}
              fill="none"
              stroke={`rgba(255, 255, 255, ${0.15 - ringIndex * 0.03})`}
              strokeWidth="1"
              strokeDasharray="4 4"
            />

            {/* 轨道上的星星 */}
            {[...Array(3 - ringIndex)].map((_, starIndex) => {
              const speed = isUrgent ? 30 : 80 + ringIndex * 40;
              const baseAngle = (Date.now() / speed + starIndex * 120) * (ringIndex % 2 === 0 ? 1 : -1);
              const angle = baseAngle * Math.PI / 180;
              const x = 65 + radius * Math.cos(angle);
              const y = 65 + radius * Math.sin(angle);

              const starColors = ['#FFD700', '#00BFFF', '#FF69B4'];
              
              return (
                <g key={starIndex}>
                  {/* 星星光芒 */}
                  <polygon
                    points={`${x},${y - 6} ${x + 2},${y - 2} ${x + 6},${y} ${x + 2},${y + 2} ${x},${y + 6} ${x - 2},${y + 2} ${x - 6},${y} ${x - 2},${y - 2}`}
                    fill={starColors[starIndex]}
                    opacity="0.9"
                    style={{
                      filter: `drop-shadow(0 0 6px ${starColors[starIndex]})`,
                      transform: `scale(${isUrgent ? 1.2 : 1})`,
                      transformOrigin: `${x}px ${y}px`
                    }}
                  />
                </g>
              );
            })}
          </g>
        ))}

        {/* 中心黑洞 */}
        <circle
          cx="65"
          cy="65"
          r="10"
          fill="#000"
          stroke="rgba(138, 43, 226, 0.6)"
          strokeWidth="2"
          style={{
            filter: 'drop-shadow(0 0 15px rgba(138, 43, 226, 0.8))'
          }}
        />
      </svg>
    </div>
  );

  // ==================== 6. 🎯 靶心收缩 ====================
  const renderTargetShrink = () => (
    <div style={styles_common.container}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        {/* 同心圆 - 从外到内收缩 */}
        {[55, 44, 33, 22, 11].map((baseRadius, i) => {
          const shrinkFactor = 1 - (progressPercent / 100) * 0.7;
          const currentRadius = baseRadius * shrinkFactor;
          const colors = ['#ff0000', '#ffffff', '#ff0000', '#ffffff', '#ff0000'];

          return (
            <circle
              key={i}
              cx="65"
              cy="65"
              r={Math.max(currentRadius, 2)}
              fill={i % 2 === 0 ? colors[i] : 'none'}
              stroke={colors[i]}
              strokeWidth="3"
              opacity={0.9 - i * 0.1}
              style={{
                transition: 'r 0.5s ease-out',
                filter: i === 0 ? 'drop-shadow(0 0 8px rgba(255, 0, 0, 0.5))' : 'none'
              }}
            />
          );
        })}

        {/* 十字准星 */}
        <line x1="65" y1="58" x2="65" y2="62" stroke="#000" strokeWidth="2" />
        <line x1="62" y1="65" x2="68" y2="65" stroke="#000" strokeWidth="2" />

        {/* 即将命中效果 */}
        {isUrgent && (
          <circle
            cx="65"
            cy="65"
            r="60"
            fill="none"
            stroke="#ff0000"
            strokeWidth="2"
            strokeDasharray="10 5"
            opacity="0.6"
            style={{ animation: 'target-lock 1s linear infinite' }}
          />
        )}
      </svg>
    </div>
  );

  // ==================== 7. 🌈 彩虹渐变 ====================
  const renderRainbowCycle = () => (
    <div style={styles_common.container}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        {/* 彩虹弧 */}
        <defs>
          <linearGradient id="rainbowGradient" gradientUnits="userSpaceOnUse" x1="15" y1="115" x2="115" y2="115">
            <stop offset="0%" stopColor="#ff0000" />
            <stop offset="17%" stopColor="#ff7f00" />
            <stop offset="33%" stopColor="#ffff00" />
            <stop offset="50%" stopColor="#00ff00" />
            <stop offset="67%" stopColor="#0000ff" />
            <stop offset="83%" stopColor="#4b0082" />
            <stop offset="100%" stopColor="#9400d3" />
          </linearGradient>
        </defs>

        {/* 主彩虹弧 - 显示进度 */}
        <path
          d={`M 15 95 A 50 50 0 0 1 115 95`}
          fill="none"
          stroke="url(#rainbowGradient)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${progressPercent * 1.57} 157`}
          style={{
            filter: 'drop-shadow(0 0 10px rgba(255, 255, 255, 0.5))',
            transition: 'stroke-dasharray 0.5s ease'
          }}
        />

        {/* 当前位置高亮点 */}
        {
          (() => {
            const angle = Math.PI * (1 - progressPercent / 100);
            const x = 65 + 50 * Math.cos(angle);
            const y = 95 - 50 * Math.sin(angle);
            
            return (
              <circle
                cx={x}
                cy={y}
                r="8"
                fill="#ffffff"
                opacity="0.9"
                style={{
                  filter: 'drop-shadow(0 0 12px #ffffff)',
                  animation: 'rainbow-sparkle 1s infinite'
                }}
              >
                <animate attributeName="r" values="6;10;6" dur="1s" repeatCount="indefinite" />
              </circle>
            );
          })()
        }

        {/* 云朵装饰 */}
        <ellipse cx="25" cy="98" rx="12" ry="6" fill="white" opacity="0.8" />
        <ellipse cx="105" cy="98" rx="12" ry="6" fill="white" opacity="0.8" />
      </svg>
    </div>
  );

  // ==================== 8. ❤️ 心跳脉动 ====================
  const renderHeartbeatPulse = () => (
    <div style={styles_common.container}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        {/* ECG波形背景路径 */}
        <path
          d="M 10 60 L 30 60 L 35 60 L 40 30 L 45 90 L 50 55 L 53 60 L 110 60"
          fill="none"
          stroke="rgba(255, 0, 64, 0.15)"
          strokeWidth="2"
        />

        {/* 动态ECG波形 - 根据进度绘制 */}
        <path
          d={`M 10 60 L ${10 + progressPercent * 0.9} 60 ${
            progressPercent > 25 ? `L ${10 + progressPercent * 0.9 + 5} 60 L ${10 + progressPercent * 0.9 + 8} ${isUrgent ? 25 : 35} L ${10 + progressPercent * 0.9 + 11} ${isUrgent ? 95 : 85}` : ''
          } ${
            progressPercent > 35 ? `L ${10 + progressPercent * 0.9 + 14} 58 L ${10 + progressPercent * 0.9 + 17} 60` : ''
          } L ${10 + progressPercent * 0.97} 60`}
          fill="none"
          stroke="#ff0040"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            filter: `drop-shadow(0 0 ${isUrgent ? 10 : 6}px #ff0040)`,
            animation: isUrgent ? 'ecg-urgent 0.8s infinite' : 'ecg-normal 1.5s infinite'
          }}
        />

        {/* 心形图标 */}
        <g transform="translate(60, 35)">
          <path
            d="M 0 10 C -15 -5 -15 -20 0 -20 C 15 -20 15 -5 0 10"
            fill="#ff0040"
            opacity="0.8"
            style={{
              transform: `scale(${isUrgent ? 1.3 : 1})`,
              transformOrigin: 'center',
              animation: `heartbeat ${isUrgent ? 0.4 : 1}s infinite`,
              filter: 'drop-shadow(0 0 8px #ff0040)'
            }}
          />
        </g>

        {/* 脉搏光晕 */}
        <circle
          cx="60"
          cy="45"
          r="25"
          fill="url(#heartbeatGlow)"
          opacity="0.4"
          style={{
            animation: `pulse-glow ${isUrgent ? 0.4 : 1}s infinite`
          }}
        />

        <defs>
          <radialGradient id="heartbeatGlow">
            <stop offset="0%" stopColor="#ff0040" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#ff0040" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );

  // ==================== 9. 🌀 漩涡吸入 ====================
  const renderVortexSwirl = () => (
    <div style={styles_common.container}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        <defs>
          <radialGradient id="vortexGradient">
            <stop offset="0%" stopColor="#000000" />
            <stop offset="100%" stopColor="rgba(75, 0, 130, 0.8)" />
          </radialGradient>
        </defs>

        {/* 漩涡臂 - 使用螺旋线 */}
        {[0, 1, 2].map((arm) => (
          <path
            key={arm}
            d={(() => {
              let path = '';
              for (let i = 0; i <= 100; i++) {
                const t = i / 100;
                const angle = t * Math.PI * 4 + (arm * Math.PI * 2 / 3) + (Date.now() / (isUrgent ? 800 : 2000));
                const radius = t * 55;
                const x = 65 + radius * Math.cos(angle);
                const y = 65 + radius * Math.sin(angle);
                path += `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
              }
              return path;
            })()}
            fill="none"
            stroke={`hsla(${260 + arm * 30}, 80%, 65%, ${0.7 - arm * 0.15})`}
            strokeWidth={3 - arm * 0.5}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 ${6 - arm * 2}px hsla(${260 + arm * 30}, 80%, 65%, 0.6))`,
              transition: 'all 0.3s ease'
            }}
          />
        ))}

        {/* 中心黑洞 */}
        <circle
          cx="65"
          cy="65"
          r={15 - progressPercent * 0.08}
          fill="url(#vortexGradient)"
          style={{
            filter: 'drop-shadow(0 0 20px rgba(75, 0, 130, 0.9))',
            animation: isUrgent ? 'vortex-pull-fast 0.5s infinite' : 'vortex-pull 2s infinite'
          }}
        />

        {/* 吸入粒子 */}
        {[...Array(12)].map((_, i) => {
          const angle = (i * 30 + Date.now() / 50) * Math.PI / 180;
          const startRadius = 55;
          const endRadius = 18;
          const currentRadius = startRadius - (startRadius - endRadius) * ((Date.now() / 3000 + i / 12) % 1);
          const x = 65 + currentRadius * Math.cos(angle);
          const y = 65 + currentRadius * Math.sin(angle);

          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={2}
              fill="#c084fc"
              opacity="0.8"
              style={{ filter: 'drop-shadow(0 0 4px #c084fc)' }}
            />
          );
        })}
      </svg>
    </div>
  );

  // ==================== 10. 🎵 音波律动 ====================
  const renderSoundwave = () => (
    <div style={styles_common.container}>
      <svg width="140" height="100" viewBox="0 0 140 100">
        {/* 音频频谱柱状图 */}
        {[...Array(20)].map((_, i) => {
          const centerDist = Math.abs(i - 9.5) / 9.5; // 0=中心, 1=边缘
          const baseHeight = 15 + (1 - centerDist) * 35; // 中间高，两边低
          
          // 根据时间和位置计算动态高度
          const timeOffset = Date.now() / (isUrgent ? 200 : 400);
          const waveHeight = baseHeight * (0.5 + 0.5 * Math.sin(timeOffset + i * 0.5));
          const finalHeight = waveHeight * (0.4 + progressPercent * 0.006);
          
          const hue = 200 + i * 8; // 渐变色相

          return (
            <rect
              key={i}
              x={i * 7 + 2}
              y={(100 - finalHeight) / 2}
              width="5"
              height={finalHeight}
              fill={`hsla(${hue}, 85%, 65%, 0.9)`}
              rx="2"
              ry="2"
              style={{
                filter: `drop-shadow(0 0 ${4 + (1 - centerDist) * 4}px hsla(${hue}, 85%, 65%, 0.6))`
              }}
            />
          );
        })}

        {/* 波形曲线覆盖层 */}
        <path
          d={(() => {
            let path = 'M';
            for (let i = 0; i <= 20; i++) {
              const x = i * 7 + 4.5;
              const timeOffset = Date.now() / (isUrgent ? 200 : 400);
              const y = 50 + Math.sin(timeOffset + i * 0.6) * (15 + progressPercent * 0.2);
              path += `${i === 0 ? '' : 'L'} ${x} ${y}`;
            }
            return path;
          })()}
          fill="none"
          stroke="rgba(255, 255, 255, 0.6)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );

  // ==================== 11. 🧊 冰块融化 ====================
  const renderIceMelt = () => (
    <div style={styles_common.container}>
      <svg width="120" height="140" viewBox="0 0 120 140">
        {/* 冰块主体 - 逐渐缩小 */}
        <rect
          x="30"
          y={20 + (1 - progressPercent / 100) * 30}
          width={60 - progressPercent * 0.3}
          height={80 - progressPercent * 0.5}
          rx="8"
          fill="url(#iceGradient)"
          opacity="0.9"
          style={{
            filter: 'drop-shadow(0 0 10px rgba(135, 206, 235, 0.6))',
            transition: 'all 0.5s ease'
          }}
        >

        </rect>

        {/* 冰块高光 */}
        <rect
          x="38"
          y={28 + (1 - progressPercent / 100) * 30}
          width="15"
          height={30 - progressPercent * 0.2}
          rx="4"
          fill="rgba(255, 255, 255, 0.4)"
          transform="skewX(-10)"
        />

        {/* 水滴 - 融化的水 */}
        {progressPercent > 20 && [...Array(Math.floor(progressPercent / 15))].map((_, i) => (
          <path
            key={i}
            d={`M ${35 + i * 12 + Math.sin(Date.now() / 500 + i) * 3} ${118}
                 Q ${37 + i * 12 + Math.sin(Date.now() / 500 + i) * 3} ${124}
                 Q ${35 + i * 12 + Math.sin(Date.now() / 500 + i) * 3} ${128}
                 Q ${33 + i * 12 + Math.sin(Date.now() / 500 + i) * 3} ${124}
                 Q ${35 + i * 12 + Math.sin(Date.now() / 500 + i) * 3} ${118}`}
            fill="#87CEEB"
            opacity="0.7"
            style={{
              filter: 'drop-shadow(0 0 3px #87CEEB)',
              animation: `drip-fall ${1.5 + i * 0.2}s ease-in infinite`,
              animationDelay: `${i * 0.2}s`
            }}
          />
        ))}

        {/* 底部积水 */}
        <ellipse
          cx="60"
          cy="134"
          rx={20 + progressPercent * 0.3}
          ry="4"
          fill="#87CEEB"
          opacity="0.6"
          style={{
            filter: 'drop-shadow(0 0 5px #87CEEB)',
            transition: 'rx 0.5s ease'
          }}
        />

        <defs>
          <linearGradient id="iceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E0FFFF" />
            <stop offset="50%" stopColor="#87CEEB" />
            <stop offset="100%" stopColor="#ADD8E6" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );

  // ==================== 12. 🌙 月相变化 ====================
  const renderMoonPhase = () => (
    <div style={styles_common.container}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        {/* 背景星空 */}
        {[...Array(15)].map((_, i) => {
          const x = 10 + (i * 17) % 110;
          const y = 10 + (i * 23) % 110;
          const size = 1 + (i % 3);
          const twinkle = Math.sin(Date.now() / 500 + i) > 0 ? 1 : 0.3;
          
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={size}
              fill="#FFFFFF"
              opacity={twinkle}
            />
          );
        })}

        {/* 月亮光晕 */}
        <circle
          cx="65"
          cy="65"
          r="42"
          fill="none"
          stroke="rgba(255, 255, 200, 0.2)"
          strokeWidth="8"
          style={{
            filter: 'blur(4px)',
            animation: 'moon-glow 3s infinite'
          }}
        />

        {/* 月亮本体 - 使用clipPath实现月相变化 */}
        <defs>
          <clipPath id="moonPhaseClip">
            <rect
              x={65 - 35 + (progressPercent / 100) * 70}
              y="20"
              width="70"
              height="90"
            />
          </clipPath>
          <radialGradient id="moonGradient">
            <stop offset="0%" stopColor="#FFFACD" />
            <stop offset="100%" stopColor="#F0E68C" />
          </radialGradient>
        </defs>

        <circle
          cx="65"
          cy="65"
          r="35"
          fill="url(#moonGradient)"
          clipPath="url(#moonPhaseClip)"
          style={{
            filter: 'drop-shadow(0 0 15px rgba(255, 250, 205, 0.6))'
          }}
        />

        {/* 月球表面纹理 */}
        <g clipPath="url(#moonPhaseClip)" opacity="0.15">
          <circle cx="50" cy="55" r="6" fill="#888" />
          <circle cx="75" cy="70" r="4" fill="#888" />
          <circle cx="58" cy="78" r="5" fill="#888" />
          <circle cx="72" cy="50" r="3" fill="#888" />
        </g>
      </svg>
    </div>
  );

  // ==================== 13. ⏳ 沙漏流动 ====================
  const renderHourglassFlow = () => (
    <div style={styles_common.container}>
      <svg width="100" height="140" viewBox="0 0 100 140">
        {/* 沙漏外框 */}
        <path
          d="M 20 10 L 80 10 L 50 70 L 80 130 L 20 130 L 50 70 Z"
          fill="none"
          stroke="#D2691E"
          strokeWidth="4"
          strokeLinejoin="round"
        />

        {/* 上半部分沙子（逐渐减少） */}
        <path
          d={`M 25 15 L 75 15 L 50 ${65 - progressPercent * 0.35} Z`}
          fill="#F4A460"
          opacity="0.9"
          style={{
            transition: 'd 0.5s ease'
          }}
        />

        {/* 下半部分沙子（逐渐增加） */}
        <path
          d={`M 30 ${75 + progressPercent * 0.45} L 70 ${75 + progressPercent * 0.45} L 75 125 L 25 125 Z`}
          fill="#F4A460"
          opacity="0.9"
          style={{
            transition: 'd 0.5s ease'
          }}
        />

        {/* 流动的沙子流 */}
        <line
          x1="50"
          y1={65 - progressPercent * 0.35}
          x2="50"
          y2={75 + progressPercent * 0.45}
          stroke="#F4A460"
          strokeWidth="3"
          strokeDasharray="4 2"
          opacity="0.8"
          style={{
            animation: 'sand-flow 0.5s linear infinite'
          }}
        />

        {/* 沙漏框架装饰 */}
        <rect x="45" y="5" width="10" height="5" fill="#8B4513" />
        <rect x="45" y="130" width="10" height="5" fill="#8B4513" />
      </svg>
    </div>
  );

  // ==================== 14. 🎪 马戏团气球 ====================
  const renderBalloonDeflate = () => (
    <div style={styles_common.container}>
      <svg width="100" height="150" viewBox="0 0 100 150">
        {/* 气球绳 */}
        <path
          d={`M 50 ${100 + (1 - progressPercent / 100) * 20}
                 Q ${45 + Math.sin(Date.now() / 300) * 3} ${115 + (1 - progressPercent / 100) * 10}
                 Q ${55 + Math.cos(Date.now() / 350) * 2} ${130}
                 L 50 145`}
          fill="none"
          stroke="#888"
          strokeWidth="2"
        />

        {/* 气球本体 - 逐渐变小 */}
        <ellipse
          cx="50"
          cy={55 + (1 - progressPercent / 100) * 15}
          rx={35 - progressPercent * 0.25}
          ry={45 - progressPercent * 0.35}
          fill="url(#balloonGradient)"
          style={{
            filter: 'drop-shadow(0 0 10px rgba(255, 99, 71, 0.5))',
            transition: 'all 0.5s ease',
            transform: `rotate(${Math.sin(Date.now() / 500) * 3}deg)`,
            transformOrigin: 'center bottom'
          }}
        />

        {/* 气球结 */}
        <triangle points="47,${98 + (1 - progressPercent / 100) * 18} 53,${98 + (1 - progressPercent / 100) * 18} 50,${103 + (1 - progressPercent / 100) * 18}" 
          fill="#DC143C" 
        />

        {/* 高光 */}
        <ellipse
          cx="38"
          cy={40 + (1 - progressPercent / 100) * 12}
          rx="8"
          ry="12"
          fill="rgba(255, 255, 255, 0.4)"
          transform="rotate(-20, 38, 40)"
        />

        <defs>
          <radialGradient id="balloonGradient" cx="30%" cy="30%">
            <stop offset="0%" stopColor="#FFB6C1" />
            <stop offset="50%" stopColor="#FF6347" />
            <stop offset="100%" stopColor="#DC143C" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );

  // ==================== 15. 🔮 水晶球占卜 ====================
  const renderCrystalBall = () => (
    <div style={styles_common.container}>
      <svg width="130" height="140" viewBox="0 0 130 140">
        {/* 底座 */}
        <path
          d="M 45 125 L 85 125 L 75 135 L 55 135 Z"
          fill="url(#standGradient)"
        />

        {/* 迷雾层 - 随着进度消散 */}
        <circle
          cx="65"
          cy="65"
          r="52"
          fill="url(#mistGradient)"
          opacity={Math.max(0, 1 - progressPercent / 100)}
          style={{
            transition: 'opacity 1s ease',
            filter: 'blur(2px)'
          }}
        />

        {/* 水晶球本体 */}
        <circle
          cx="65"
          cy="65"
          r="50"
          fill="url(#crystalGradient)"
          opacity="0.8"
          style={{
            filter: 'drop-shadow(0 0 20px rgba(147, 51, 234, 0.6))'
          }}
        />

        {/* 内部光芒 - 逐渐显现 */}
        <circle
          cx="65"
          cy="65"
          r={progressPercent * 0.35}
          fill="url(#innerLightGradient)"
          opacity={progressPercent / 100}
          style={{
            filter: `drop-shadow(0 0 ${15 + progressPercent * 0.2}px rgba(255, 255, 255, 0.8))`,
            transition: 'all 0.5s ease',
            animation: 'crystal-glow 2s infinite'
          }}
        />

        {/* 光芒射线 */}
        {progressPercent > 50 && [...Array(8)].map((_, i) => {
          const angle = (i * 45 + Date.now() / 100) * Math.PI / 180;
          const innerR = progressPercent * 0.25;
          const outerR = 48;
          
          return (
            <line
              key={i}
              x1={65 + innerR * Math.cos(angle)}
              y1={65 + innerR * Math.sin(angle)}
              x2={65 + outerR * Math.cos(angle)}
              y2={65 + outerR * Math.sin(angle)}
              stroke="rgba(255, 255, 255, 0.4)"
              strokeWidth="2"
              opacity={(progressPercent - 50) / 50}
            />
          );
        })}

        {/* 高光反射 */}
        <ellipse
          cx="48"
          cy="45"
          rx="15"
          ry="10"
          fill="rgba(255, 255, 255, 0.3)"
          transform="rotate(-30, 48, 45)"
        />

        <defs>
          <linearGradient id="standGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFD700" />
            <stop offset="100%" stopColor="#B8860B" />
          </linearGradient>
          <radialGradient id="mistGradient">
            <stop offset="0%" stopColor="#CCCCCC" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#666666" stopOpacity="0.3" />
          </radialGradient>
          <radialGradient id="crystalGradient" cx="35%" cy="35%">
            <stop offset="0%" stopColor="#E6E6FA" />
            <stop offset="50%" stopColor="#9370DB" />
            <stop offset="100%" stopColor="#4B0082" />
          </radialGradient>
          <radialGradient id="innerLightGradient">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#DDA0DD" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );

  // ==================== 16. 🎰 老虎机滚动 ====================
  const renderSlotSpin = () => (
    <div style={styles_common.container}>
      <div style={{
        background: 'linear-gradient(145deg, #DC143C 0%, #8B0000 100%)',
        borderRadius: '16px',
        padding: '16px',
        boxShadow: '0 8px 24px rgba(220, 20, 60, 0.5), inset 0 2px 4px rgba(255, 255, 255, 0.2)',
        border: '3px solid #FFD700'
      }}>
        {/* 显示窗口 */}
        <div style={{
          background: '#000',
          borderRadius: '8px',
          padding: '12px',
          display: 'flex',
          gap: '8px',
          marginBottom: '12px',
          border: '2px solid #333'
        }}>
          {/* 三个符号槽位 */}
          {[0, 1, 2].map((slot) => {
            const symbols = ['🍒', '🍋', '🔔', '⭐', '7️⃣'];
            const currentIndex = Math.floor((Date.now() / (refreshing ? 100 : 200 + slot * 50) + slot * 1000)) % symbols.length;
            const displaySymbol = refreshing ? symbols[currentIndex] : symbols[Math.floor(progressPercent / 20) % symbols.length];

            return (
              <div
                key={slot}
                style={{
                  width: '50px',
                  height: '60px',
                  background: 'linear-gradient(180deg, #111 0%, #000 100%)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                  border: '1px solid #444',
                  overflow: 'hidden',
                  position: 'relative'
                }}
              >
                <span style={{
                  position: 'absolute',
                  animation: refreshing ? 'symbol-spin 0.15s linear infinite' : 'none'
                }}>
                  {displaySymbol}
                </span>
                
                {/* 滚动时的模糊效果 */}
                {refreshing && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.3) 50%, transparent 100%)',
                    animation: 'slot-blur 0.2s linear infinite'
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* 进度条 - 老虎机风格 */}
        <div style={{
          height: '8px',
          background: '#222',
          borderRadius: '4px',
          overflow: 'hidden',
          border: '1px solid #444'
        }}>
          <div style={{
            height: '100%',
            width: `${progressPercent}%`,
            background: 'linear-gradient(90deg, #FFD700 0%, #FFA500 100%)',
            borderRadius: '4px',
            boxShadow: '0 0 10px #FFD700',
            transition: 'width 0.5s ease'
          }} />
        </div>

        {/* 拉杆装饰 */}
        <div style={{
          marginTop: '8px',
          display: 'flex',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '6px',
            height: '30px',
            background: 'linear-gradient(180deg, #FFD700 0%, #B8860B 100%)',
            borderRadius: '3px',
            position: 'relative'
          }}>
            <div style={{
              position: 'absolute',
              top: '-8px',
              left: '-5px',
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: 'radial-gradient(circle at 30% 30%, #FFD700, #B8860B)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
              cursor: 'pointer'
            }} />
          </div>
        </div>
      </div>
    </div>
  );

  // 渲染对应的视觉效果
  const renderVisualEffect = (type: string) => {
    switch (type) {
      case 'ripple-spread': return renderRippleSpread();
      case 'flame-burn': return renderFlameBurn();
      case 'energy-charge': return renderEnergyCharge();
      case 'flower-bloom': return renderFlowerBloom();
      case 'star-orbit': return renderStarOrbit();
      case 'target-shrink': return renderTargetShrink();
      case 'rainbow-cycle': return renderRainbowCycle();
      case 'heartbeat-pulse': return renderHeartbeatPulse();
      case 'vortex-swirl': return renderVortexSwirl();
      case 'soundwave': return renderSoundwave();
      case 'ice-melt': return renderIceMelt();
      case 'moon-phase': return renderMoonPhase();
      case 'hourglass-flow': return renderHourglassFlow();
      case 'balloon-deflate': return renderBalloonDeflate();
      case 'crystal-ball': return renderCrystalBall();
      case 'slot-spin': return renderSlotSpin();
      default: return null;
    }
  };

  return (
    <div style={showcaseStyles.container}>
      <div style={showcaseStyles.header}>
        <h1 style={showcaseStyles.title}>✨ 纯视觉化倒计时动画 ✨</h1>
        <p style={showcaseStyles.subtitle}>不显示数字，完全依靠动画传达时间信息</p>
      </div>

      <div style={showcaseStyles.grid}>
        {visualStyles.map((style, index) => (
          <div key={index} style={showcaseStyles.card}>
            <h3 style={showcaseStyles.cardTitle}>{style.name}</h3>
            <p style={showcaseStyles.description}>{style.description}</p>
            <div style={showcaseStyles.visualMetaphor}>
              💡 {style.visualMetaphor}
            </div>

            <div style={showcaseStyles.previewArea}>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                style={showcaseStyles.button}
              >
                {renderVisualEffect(style.type)}
              </button>
            </div>

            <div style={showcaseStyles.infoBar}>
              <span>⏱️ 刷新频率: <strong>{refreshFreq}s</strong></span>
              <span>📊 进度: <strong>{Math.round(progressPercent)}%</strong></span>
              <span>⚡ 紧迫度: <strong>{Math.round(urgency * 100)}%</strong></span>
            </div>
          </div>
        ))}
      </div>

      <style>{keyframesCSS}</style>
    </div>
  );
};

// ==================== 样式定义 ====================

const styles_common = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '130px',
    cursor: 'pointer',
    transition: 'transform 0.3s ease',
    ':hover': {
      transform: 'scale(1.05)'
    }
  } as React.CSSProperties
};

const showcaseStyles = {
  container: {
    padding: '40px 20px',
    background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0a0a1a 100%)',
    minHeight: '100vh',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    color: '#ffffff'
  } as React.CSSProperties,

  header: {
    textAlign: 'center',
    marginBottom: '48px'
  } as React.CSSProperties,

  title: {
    fontSize: '36px',
    fontWeight: 900,
    marginBottom: '12px',
    background: 'linear-gradient(135deg, #FFD700 0%, #FF6B6B 50%, #4ECDC4 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    letterSpacing: '-0.5px'
  } as React.CSSProperties,

  subtitle: {
    fontSize: '16px',
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: 400
  } as React.CSSProperties,

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '24px',
    maxWidth: '1800px',
    margin: '0 auto',
    '@media (max-width: 1600px)': {
      gridTemplateColumns: 'repeat(3, 1fr)'
    },
    '@media (max-width: 1200px)': {
      gridTemplateColumns: 'repeat(2, 1fr)'
    },
    '@media (max-width: 768px)': {
      gridTemplateColumns: '1fr'
    }
  } as React.CSSProperties,

  card: {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '20px',
    padding: '24px',
    backdropFilter: 'blur(10px)',
    transition: 'transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease',
    ':hover': {
      transform: 'translateY(-8px) scale(1.02)',
      boxShadow: '0 20px 40px rgba(255, 215, 0, 0.15)',
      borderColor: 'rgba(255, 215, 0, 0.3)'
    }
  } as React.CSSProperties,

  cardTitle: {
    fontSize: '20px',
    fontWeight: 800,
    marginBottom: '8px',
    color: '#FFD700'
  } as React.CSSProperties,

  description: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 1.5,
    marginBottom: '8px'
  } as React.CSSProperties,

  visualMetaphor: {
    fontSize: '12px',
    color: 'rgba(78, 205, 196, 0.9)',
    fontStyle: 'italic',
    marginBottom: '20px'
  } as React.CSSProperties,

  previewArea: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '140px',
    padding: '16px',
    background: 'rgba(0, 0, 0, 0.4)',
    borderRadius: '16px',
    border: '1px dashed rgba(255, 255, 255, 0.15)',
    marginBottom: '16px'
  } as React.CSSProperties,

  button: {
    background: 'transparent',
    border: 'none',
    padding: 0,
    outline: 'none',
    position: 'relative' as const,
    cursor: 'pointer',
    transition: 'opacity 0.3s ease',
    ':disabled': {
      cursor: 'not-allowed',
      opacity: 0.7
    }
  } as React.CSSProperties,

  infoBar: {
    display: 'flex',
    justifyContent: 'space-around',
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.5)',
    padding: '10px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '10px',
    gap: '8px',
    flexWrap: 'wrap' as const
  } as React.CSSProperties
};

// CSS 动画关键帧
const keyframesCSS = `
  @keyframes pulse-gentle {
    0%, 100% { transform: scale(1); opacity: 0.8; }
    50% { transform: scale(1.15); opacity: 1; }
  }

  @keyframes pulse-core-urgent {
    0%, 100% { transform: scale(1); opacity: 1; }
    25% { transform: scale(1.3); opacity: 0.8; }
    50% { transform: scale(1); opacity: 1; }
    75% { transform: scale(1.3); opacity: 0.8; }
  }

  @keyframes flame-dance {
    0%, 100% { transform: scaleX(1) scaleY(1); }
    25% { transform: scaleX(0.95) scaleY(1.05); }
    50% { transform: scaleX(1.05) scaleY(0.95); }
    75% { transform: scaleX(0.97) scaleY(1.03); }
  }

  @keyframes spark-rise {
    0% { transform: translateY(0) scale(1); opacity: 1; }
    100% { transform: translateY(-30px) scale(0); opacity: 0; }
  }

  @keyframes energy-pulse {
    0%, 100% { transform: scale(1); opacity: 0.5; }
    50% { transform: scale(1.1); opacity: 0.7; }
  }

  @keyframes energy-pulse-fast {
    0%, 100% { transform: scale(1); opacity: 0.6; }
    25% { transform: scale(1.15); opacity: 0.9; }
    50% { transform: scale(1); opacity: 0.6; }
    75% { transform: scale(1.15); opacity: 0.9; }
  }

  @keyframes flower-center-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }

  @keyframes target-lock {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes rainbow-sparkle {
    0%, 100% { filter: drop-shadow(0 0 8px #fff); }
    50% { filter: drop-shadow(0 0 16px #fff); }
  }

  @keyframes ecg-normal {
    0%, 100% { stroke-dashoffset: 0; }
    50% { stroke-dashoffset: 10; }
  }

  @keyframes ecg-urgent {
    0%, 100% { stroke-dashoffset: 0; }
    25% { stroke-dashoffset: 5; }
    50% { stroke-dashoffset: 0; }
    75% { stroke-dashoffset: 5; }
  }

  @keyframes heartbeat {
    0%, 100% { transform: scale(1); }
    15% { transform: scale(1.15); }
    30% { transform: scale(1); }
    45% { transform: scale(1.15); }
    60% { transform: scale(1); }
  }

  @keyframes pulse-glow {
    0%, 100% { transform: scale(1); opacity: 0.4; }
    50% { transform: scale(1.15); opacity: 0.6; }
  }

  @keyframes vortex-pull {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.08); }
  }

  @keyframes vortex-pull-fast {
    0%, 100% { transform: scale(1); }
    25% { transform: scale(1.12); }
    50% { transform: scale(1); }
    75% { transform: scale(1.12); }
  }

  @keyframes drip-fall {
    0% { transform: translateY(0) scale(1); opacity: 0.7; }
    50% { transform: translateY(8px) scale(0.9); opacity: 0.9; }
    100% { transform: translateY(0) scale(1); opacity: 0.7; }
  }

  @keyframes sand-flow {
    from { stroke-dashoffset: 12; }
    to { stroke-dashoffset: 0; }
  }

  @keyframes moon-glow {
    0%, 100% { opacity: 0.2; transform: scale(1); }
    50% { opacity: 0.35; transform: scale(1.05); }
  }

  @keyframes crystal-glow {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.08); }
  }

  @keyframes symbol-spin {
    from { transform: translateY(0); }
    to { transform: translateY(-20px); }
  }

  @keyframes slot-blur {
    from { transform: translateY(-100%); }
    to { transform: translateY(100%); }
  }
`;

export default VisualCountdownShowcase;
