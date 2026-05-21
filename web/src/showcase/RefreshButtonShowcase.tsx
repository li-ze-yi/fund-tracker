import React, { useState, useCallback } from 'react';

interface RefreshButtonShowcaseProps {
  countdown: number;
  refreshFreq: number;
  refreshing: boolean;
  progressPercent: number;
  onRefresh: () => void;
}

interface StyleConfig {
  name: string;
  description: string;
  type: string;
}

const styles: StyleConfig[] = [
  {
    name: 'Futuristic HUD',
    description: '科幻仪表盘 - 圆形进度环 + 等宽数字',
    type: 'futuristic'
  },
  {
    name: 'Liquid Glass',
    description: '液态玻璃 - iOS26 水晶质感 + 水波纹',
    type: 'liquid-glass'
  },
  {
    name: 'Retro Arcade',
    description: '复古街机 - 霓虹灯 + CRT 扫描线',
    type: 'retro-arcade'
  },
  {
    name: 'Holographic Glitch',
    description: '全息故障 - RGB 色散 + 故障抖动',
    type: 'holographic-glitch'
  },
  {
    name: 'Digital LED',
    description: '七段数码管 - 高对比度发光显示',
    type: 'digital-led'
  },
  {
    name: 'Bioluminescence',
    description: '生物发光 - 有机脉动 + 流体渐变',
    type: 'bioluminescence'
  },
  {
    name: 'Kinetic Typography',
    description: '动态字体 - 动能排版 + 错位弹跳动画',
    type: 'kinetic-typography'
  },
  {
    name: 'Morphing Shape-Shifting',
    description: '变形变换 - 液态流体 + 形状平滑过渡',
    type: 'morphing-shape'
  },
  {
    name: 'Skeuomorphic Retro Power',
    description: '拟物复古力量按钮 - 3D立体电源开关',
    type: 'skeuomorphic-power'
  },
  {
    name: 'Chaos Packaging',
    description: '混乱包装 - 解构主义 + 故障艺术美学',
    type: 'chaos-packaging'
  },
  {
    name: 'Flip Clock Classic',
    description: '经典翻牌 - 机场时钟风格 + 3D翻转动效',
    type: 'flip-clock'
  },
  {
    name: 'Particle Explosion',
    description: '粒子爆炸 - 物理引擎 + Canvas粒子系统',
    type: 'particle-explosion'
  },
  {
    name: 'Geometric Orbital',
    description: '几何轨道 - 多层旋转环 + 行星运动轨迹',
    type: 'geometric-orbital'
  },
  {
    name: 'Pulse Wave Ripple',
    description: '脉冲波纹 - 水波扩散 + 同心圆涟漪效果',
    type: 'pulse-ripple'
  },
  {
    name: 'Digital Matrix Rain',
    description: '数字矩阵雨 - 黑客帝国风格 + 下落字符流',
    type: 'matrix-rain'
  },
  {
    name: 'Mechanical Gauge',
    description: '机械仪表盘 - 指针摆动 + 刻度显示',
    type: 'mechanical-gauge'
  }
];

const RefreshButtonShowcase: React.FC<RefreshButtonShowcaseProps> = ({
  countdown,
  refreshFreq,
  refreshing,
  progressPercent,
  onRefresh
}) => {
  const [rippleKey, setRippleKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRippleKey(prev => prev + 1);
    onRefresh();
  }, [onRefresh]);

  // ==================== 1. Futuristic HUD (科幻仪表盘) ====================
  const renderFuturisticHUD = () => {
    const isWarning = countdown <= 10;
    const circumference = 2 * Math.PI * 40; // r=40
    const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

    return (
      <div style={styles_futuristic.container}>
        <svg width="100" height="100" viewBox="0 0 100 100">
          {/* 外圈装饰 */}
          <circle cx="50" cy="50" r="47" fill="none"
            stroke={isWarning ? '#ff0040' : '#00ffff'}
            strokeWidth="1" opacity="0.3" />

          {/* 主进度环 */}
          <circle cx="50" cy="50" r="40" fill="none"
            stroke={isWarning ? '#ff0040' : '#00ffff'}
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            style={{
              filter: `drop-shadow(0 0 ${isWarning ? '8px' : '6px'} ${isWarning ? '#ff0040' : '#00ffff'})`,
              transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease'
            }}
          />

          {/* 内圈装饰 */}
          <circle cx="50" cy="50" r="32" fill="none"
            stroke={isWarning ? '#ff0040' : '#00ffff'}
            strokeWidth="1" opacity="0.2" />
        </svg>

        {/* 倒计时数字 */}
        <div style={{
          ...styles_futuristic.number,
          color: isWarning ? '#ff0040' : '#00ffff',
          textShadow: isWarning
            ? '0 0 10px #ff0040, 0 0 20px #ff0040'
            : '0 0 10px #00ffff, 0 0 20px #00ffff',
          animation: isWarning ? 'pulse-warning 0.5s infinite' : undefined
        }}>
          {countdown}
        </div>

        {refreshing && (
          <div style={styles_futuristic.refreshingOverlay}>
            <span style={styles_futuristic.refreshingText}>REFRESHING</span>
          </div>
        )}
      </div>
    );
  };

  // ==================== 2. Liquid Glass (液态玻璃) ====================
  const renderLiquidGlass = () => {
    return (
      <div style={styles_liquidGlass.container}>
        {/* 玻璃背景层 */}
        <div style={styles_liquidGlass.glassLayer} />

        {/* 高光效果 */}
        <div style={styles_liquidGlass.highlightTop} />
        <div style={styles_liquidGlass.highlightBottom} />

        {/* 水波纹效果 */}
        <div key={`ripple-${rippleKey}`} style={styles_liquidGlass.ripple} />

        {/* 数字显示 */}
        <div style={styles_liquidGlass.number}>
          {countdown}
        </div>

        {/* 进度指示器 */}
        <div style={styles_liquidGlass.progressBar}>
          <div style={{
            ...styles_liquidGlass.progressFill,
            width: `${progressPercent}%`
          }} />
        </div>

        {refreshing && (
          <div style={styles_liquidGlass.refreshingIcon}>↻</div>
        )}
      </div>
    );
  };

  // ==================== 3. Retro Arcade (复古街机) ====================
  const renderRetroArcade = () => {
    const colors = ['#00FFFF', '#FF00FF', '#FFFF00'];

    return (
      <div style={styles_retroArcade.container}>
        {/* CRT 扫描线 */}
        <div style={styles_retroArcade.scanlines} />

        {/* 霓虹边框 */}
        <div style={{
          ...styles_retroArcade.neonBorder,
          borderColor: colors[0],
          boxShadow: `
            0 0 5px ${colors[0]},
            0 0 10px ${colors[0]},
            inset 0 0 5px ${colors[0]}
          `
        }}>
          {/* 数字显示 */}
          <div style={{
            ...styles_retroArcade.number,
            color: colors[1],
            textShadow: `
              0 0 7px ${colors[1]},
              0 0 10px ${colors[1]},
              0 0 21px ${colors[1]},
              0 0 42px ${colors[1]}
            `
          }}>
            {countdown}
          </div>

          {/* 进度条 */}
          <div style={styles_retroArcade.progressBar}>
            <div style={{
              ...styles_retroArcade.progressFill,
              width: `${progressPercent}%`,
              background: `linear-gradient(90deg, ${colors.join(', ')})`
            }} />
          </div>
        </div>

        {refreshing && (
          <div style={styles_retroArcade.refreshingText}>★ LOADING ★</div>
        )}
      </div>
    );
  };

  // ==================== 4. Holographic Glitch (全息故障) ====================
  const renderHolographicGlitch = () => {
    return (
      <div style={styles_glitch.container}>
        {/* 扫描线动画 */}
        <div style={styles_glitch.scanLine} />

        {/* RGB 色散层 */}
        <div style={{
          ...styles_glitch.rgbLayer,
          color: '#ff0000',
          transform: 'translate(-2px, 0)'
        }}>
          {countdown}
        </div>
        <div style={{
          ...styles_glitch.rgbLayer,
          color: '#00ff00',
          transform: 'translate(0, 0)',
          zIndex: 2
        }}>
          {countdown}
        </div>
        <div style={{
          ...styles_glitch.rgbLayer,
          color: '#0000ff',
          transform: 'translate(2px, 0)'
        }}>
          {countdown}
        </div>

        {/* 进度环 */}
        <svg width="100" height="100" viewBox="0 0 100 100" style={{ position: 'absolute', top: 0, left: 0 }}>
          <circle cx="50" cy="50" r="40" fill="none"
            stroke="#00ffff"
            strokeWidth="2"
            strokeDasharray={`${progressPercent * 2.51}, 251`}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            opacity="0.6"
            style={{
              filter: 'drop-shadow(0 0 5px #00ffff)'
            }}
          />
        </svg>

        {refreshing && (
          <div style={styles_glitch.glitchText}>GLITCH</div>
        )}
      </div>
    );
  };

  // ==================== 5. Digital LED (七段数码管) ====================
  const renderDigitalLED = () => {
    // 七段数码管的段码映射
    const segmentMap: Record<string, string[]> = {
      '0': ['a','b','c','d','e','f'],
      '1': ['b','c'],
      '2': ['a','b','g','e','d'],
      '3': ['a','b','g','c','d'],
      '4': ['f','g','b','c'],
      '5': ['a','f','g','c','d'],
      '6': ['a','f','g','c','d','e'],
      '7': ['a','b','c'],
      '8': ['a','b','c','d','e','f','g'],
      '9': ['a','b','c','d','f','g']
    };

    const digit = Math.min(countdown, 99).toString().padStart(2, ' ');
    const segments = digit.split('').map(d => segmentMap[d] || []);

    const renderSegment = (type: string, active: boolean, index: number) => {
      const segmentStyles: Record<string, React.CSSProperties> = {
        a: { top: '5%', left: '15%', right: '15%', height: '12%' },
        b: { top: '18%', right: '5%', width: '12%', height: '30%' },
        c: { top: '52%', right: '5%', width: '12%', height: '30%' },
        d: { bottom: '5%', left: '15%', right: '15%', height: '12%' },
        e: { top: '52%', left: '5%', width: '12%', height: '30%' },
        f: { top: '18%', left: '5%', width: '12%', height: '30%' },
        g: { top: '45%', left: '15%', right: '15%', height: '12%' }
      };

      return (
        <div key={`${type}-${index}`}
          style={{
            position: 'absolute',
            ...segmentStyles[type],
            background: active
              ? '#ff0040'
              : 'rgba(255, 0, 64, 0.08)',
            boxShadow: active
              ? '0 0 8px #ff0040, 0 0 16px #ff0040'
              : 'none',
            transition: 'all 0.1s ease',
            borderRadius: type === 'a' || type === 'd' || type === 'g' ? '2px' : '2px',
            clipPath: type === 'a' || type === 'd' || type === 'g'
              ? 'polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%)'
              : 'polygon(0% 10%, 50% 0%, 100% 10%, 100% 90%, 50% 100%, 0% 90%)'
          }}
        />
      );
    };

    return (
      <div style={styles_led.container}>
        {[0, 1].map((digitIndex) => (
          <div key={digitIndex} style={styles_led.digitContainer}>
            {['a','b','c','d','e','f','g'].map((segType) =>
              renderSegment(segType, segments[digitIndex]?.includes(segType), digitIndex)
            )}
          </div>
        ))}

        {/* 进度点阵 */}
        <div style={styles_led.dotMatrix}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} style={{
              ...styles_led.dot,
              background: i < Math.floor(progressPercent / 10) ? '#00ff41' : 'rgba(0, 255, 65, 0.1)',
              boxShadow: i < Math.floor(progressPercent / 10) ? '0 0 4px #00ff41' : 'none'
            }} />
          ))}
        </div>

        {refreshing && (
          <div style={styles_led.refreshingIndicator}>●</div>
        )}
      </div>
    );
  };

  // ==================== 6. Bioluminescence (生物发光) ====================
  const renderBioluminescence = () => {
    return (
      <div style={styles_bio.container}>
        {/* 有机背景 */}
        <div style={styles_bio.organicBg} />

        {/* 流体渐变边框 */}
        <div style={styles_bio.fluidBorder} />

        {/* 脉动光晕 */}
        <div style={styles_bio.pulseGlow} />

        {/* 数字 */}
        <div style={styles_bio.number}>
          {countdown}
        </div>

        {/* 有机进度条 */}
        <div style={styles_bio.organicProgress}>
          <div style={{
            ...styles_bio.progressBlob,
            width: `${progressPercent}%`
          }} />
        </div>

        {refreshing && (
          <div style={styles_bio.particles}>
            {'●○●'.split('').map((p, i) => (
              <span key={i} style={{
                display: 'inline-block',
                animationDelay: `${i * 0.2}s`
              }}>{p}</span>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ==================== 7. Kinetic Typography (动态字体/动能排版) ====================
  const renderKineticTypography = () => {
    const digits = countdown.toString().split('');
    const isUrgent = countdown <= 5;

    // 动态彩色阴影（基于时间变化）
    const hue = (Date.now() / 20) % 360;

    return (
      <div style={styles_kinetic.container}>
        {/* 动态背景光晕 */}
        <div style={{
          ...styles_kinetic.bgGlow,
          background: `radial-gradient(circle, hsla(${hue}, 80%, 60%, 0.3) 0%, transparent 70%)`
        }} />

        {/* 动态数字容器 */}
        <div style={styles_kinetic.digitsContainer}>
          {digits.map((digit, index) => (
            <span
              key={`${digit}-${index}`}
              style={{
                ...styles_kinetic.digit,
                fontSize: isUrgent ? `${36 + (5 - countdown) * 4}px` : '32px',
                color: '#ffffff',
                textShadow: `
                  0 0 20px hsla(${hue + index * 30}, 100%, 70%, 1),
                  0 0 40px hsla(${hue + index * 30}, 100%, 60%, 0.8),
                  0 0 60px hsla(${hue + index * 30}, 100%, 50%, 0.4)
                `,
                animation: [
                  `kinetic-bounce-in 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) ${index * 0.1}s both`,
                  isUrgent ? 'kinetic-urgent-shake 0.1s infinite' : ''
                ].filter(Boolean).join(', '),
                transform: isUrgent ? `scale(${1 + Math.random() * 0.1})` : undefined
              }}
            >
              {digit}
            </span>
          ))}
        </div>

        {/* 进度条 - 动态渐变 */}
        <div style={styles_kinetic.progressBar}>
          <div style={{
            ...styles_kinetic.progressFill,
            width: `${progressPercent}%`,
            background: `linear-gradient(90deg,
              hsl(${hue}, 100%, 65%) 0%,
              hsl(${hue + 60}, 100%, 65%) 50%,
              hsl(${hue + 120}, 100%, 65%) 100%)`
          }} />
        </div>

        {/* 紧迫感指示器 */}
        {isUrgent && (
          <div style={styles_kinetic.urgentIndicator}>
            <span style={{
              color: '#ff0000',
              animation: 'kinetic-blink-fast 0.15s infinite',
              fontWeight: 900,
              fontSize: '9px',
              letterSpacing: '2px'
            }}>
              URGENT
            </span>
          </div>
        )}

        {refreshing && (
          <div style={styles_kinetic.refreshingOverlay}>
            <span style={styles_kinetic.refreshingText}>REFRESHING...</span>
          </div>
        )}
      </div>
    );
  };

  // ==================== 8. Morphing Shape-Shifting (变形变换) ====================
  const renderMorphingShape = () => {
    // 基于进度计算变形状态
    const morphPhase = (progressPercent % 33) / 33; // 0-1 循环

    // 变形 border-radius 计算
    let borderRadiusValue: string;
    if (morphPhase < 0.33) {
      // 圆形 → 方形
      const t = morphPhase / 0.33;
      borderRadiusValue = `${50 * (1 - t)}%`;
    } else if (morphPhase < 0.66) {
      // 方形 → 不规则多边形
      const t = (morphPhase - 0.33) / 0.33;
      borderRadiusValue = `${Math.random() * 30}% ${Math.random() * 40}% ${Math.random() * 35}% ${Math.random() * 45}% / ${Math.random() * 45}% ${Math.random() * 35}% ${Math.random() * 40}% ${Math.random() * 30}%`;
    } else {
      // 不规则多边形 → 圆形
      const t = (morphPhase - 0.66) / 0.33;
      borderRadiusValue = `${t * 50}%`;
    }

    return (
      <div style={styles_morphing.outerContainer}>
        {/* 液态变形主体 */}
        <div style={{
          ...styles_morphing.morphBody,
          borderRadius: borderRadiusValue,
          background: `linear-gradient(135deg,
            hsl(${220 + progressPercent * 1.2}, 85%, 60%) 0%,
            hsl(${270 + progressPercent * 0.8}, 75%, 55%) 35%,
            hsl(${320 + progressPercent * 0.6}, 80%, 58%) 66%,
            hsl(${200 + progressPercent}, 82%, 62%) 100%)`,
          animation: 'morphing-flow 3s ease-in-out infinite'
        }}>

          {/* 液态表面光泽 */}
          <div style={styles_morphing.liquidSurface} />

          {/* 浮动数字 */}
          <div style={{
            ...styles_morphing.floatingNumber,
            animation: 'morphing-float 2s ease-in-out infinite'
          }}>
            {countdown}
          </div>

          {/* 进度指示 - 液态填充 */}
          <div style={styles_morphing.liquidProgress}>
            <div style={{
              ...styles_morphing.liquidFill,
              width: `${progressPercent}%`,
              background: `linear-gradient(90deg,
                rgba(59, 130, 246, 0.9) 0%,
                rgba(147, 51, 234, 0.9) 50%,
                rgba(236, 72, 153, 0.9) 100%)`
            }} />
          </div>
        </div>

        {/* 点击时液体飞溅效果 */}
        <div key={`splash-${rippleKey}`} style={styles_morphing.splashEffect}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{
              position: 'absolute',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: `hsl(${220 + i * 40}, 85%, 65%)`,
              animation: `splash-drop 0.8s ease-out ${i * 0.05}s both`,
              left: '50%',
              top: '50%'
            }} />
          ))}
        </div>

        {refreshing && (
          <div style={styles_morphing.refreshingIndicator}>
            <span style={{
              display: 'inline-block',
              animation: 'morphing-spin 1.5s linear infinite'
            }}>⟳</span>
          </div>
        )}
      </div>
    );
  };

  // ==================== 9. Skeuomorphic Retro Power (拟物复古力量按钮) ====================
  const renderSkeuomorphicPower = () => {
    const isPressed = false; // 可扩展为状态

    return (
      <div style={styles_skeuo.outerContainer}>
        {/* 金属外壳 */}
        <div style={styles_skeuo.metalCasing}>

          {/* 内凹槽 - LED 显示区域 */}
          <div style={styles_skeuo.ledRecess}>

            {/* LED 数码显示 */}
            <div style={{
              ...styles_skeuo.ledDisplay,
              color: '#ffb000',
              textShadow: `
                0 0 10px #ffb000,
                0 0 20px #ff8c00,
                0 0 30px #ff6600,
                inset 0 0 8px rgba(255, 176, 0, 0.5)
              `,
              animation: refreshing ? 'led-flicker 0.3s infinite' : 'led-glow 2s ease-in-out infinite'
            }}>
              {String(countdown).padStart(2, '0')}
            </div>

            {/* 进度条 - 机械刻度风格 */}
            <div style={styles_skeuo.mechanicalScale}>
              <div style={{
                ...styles_skeuo.scaleFill,
                width: `${progressPercent}%`,
                background: `linear-gradient(180deg,
                  #00ff41 0%,
                  #88ff00 ${progressPercent > 50 ? 50 : progressPercent}%,
                  #ffcc00 ${progressPercent > 75 ? 75 : progressPercent}%,
                  #ff3300 100%)`
              }} />
            </div>
          </div>

          {/* 电源按钮本体 */}
          <button style={{
            ...styles_skeuo.powerButton,
            boxShadow: isPressed
              ? `
                  inset 0 4px 8px rgba(0, 0, 0, 0.6),
                  inset 0 2px 4px rgba(0, 0, 0, 0.4)
                `
              : `
                  0 6px 0 #444,
                  0 8px 12px rgba(0, 0, 0, 0.6),
                  inset 0 2px 4px rgba(255, 255, 255, 0.2),
                  inset 0 -2px 4px rgba(0, 0, 0, 0.3)
                `,
            transform: isPressed ? 'translateY(4px)' : 'translateY(0)'
          }}>
            {/* 电源图标 */}
            <span style={{
              ...styles_skeuo.powerIcon,
              color: refreshing ? '#00ff41' : '#888',
              textShadow: refreshing
                ? '0 0 10px #00ff41, 0 0 20px #00ff41'
                : 'none',
              animation: refreshing ? 'power-blink 0.5s infinite' : 'none'
            }}>⏻</span>
          </button>

          {/* 指示灯 LED */}
          <div style={{
            ...styles_skeuo.indicatorLED,
            background: refreshing
              ? 'radial-gradient(circle at 30% 30%, #00ff88, #00aa44)'
              : 'radial-gradient(circle at 30% 30%, #ff3333, #aa0000)',
            boxShadow: refreshing
              ? '0 0 15px #00ff88, 0 0 30px rgba(0, 255, 136, 0.5), inset 0 0 8px rgba(255, 255, 255, 0.4)'
              : '0 0 8px #ff3333, inset 0 0 4px rgba(255, 255, 255, 0.3)',
            animation: refreshing ? 'led-pulse-green 1s infinite' : 'led-pulse-red 2s infinite'
          }} />

          {/* 金属边框高光 */}
          <div style={styles_skeuo.bevelHighlight} />
          <div style={styles_skeuo.bevelShadow} />
        </div>
      </div>
    );
  };

  // ==================== 10. Chaos Packaging (混乱包装/解构主义) ====================
  const renderChaosPackaging = () => {
    const digits = countdown.toString().split('');
    const chaosColors = ['#FF0040', '#00FFFF', '#FFFF00', '#FF00FF', '#00FF41'];
    const chaosAngles = [-12, 8, -5, 15, -8, 10];

    return (
      <div style={styles_chaos.container}>
        {/* 噪点纹理叠加 */}
        <div style={styles_chaos.noiseTexture} />

        {/* 不对称几何装饰 */}
        <div style={{
          ...styles_chaos.geoShape1,
          transform: `rotate(${chaosAngles[0]}deg)`,
          borderColor: chaosColors[0]
        }} />
        <div style={{
          ...styles_chaos.geoShape2,
          transform: `rotate(${chaosAngles[1]}deg)`,
          backgroundColor: `${chaosColors[1]}20`
        }} />
        <div style={{
          ...styles_chaos.geoShape3,
          transform: `rotate(${chaosAngles[2]}deg)`,
          borderColor: chaosColors[2]
        }} />

        {/* 碎片化数字显示 */}
        <div style={styles_chaos.fragmentedDigits}>
          {digits.map((digit, index) => (
            <span
              key={`chaos-digit-${index}`}
              style={{
                ...styles_chaos.chaosDigit,
                color: chaosColors[index % chaosColors.length],
                fontSize: `${28 + index * 6}px`,
                transform: `
                  rotate(${chaosAngles[index % chaosAngles.length]}deg)
                  translate(${(index % 2 === 0 ? 1 : -1) * (index * 2)}px, ${(index % 2 === 0 ? -1 : 1) * (index * 3)}px)
                  scale(${1 + Math.random() * 0.15})
                `,
                textShadow: `
                  ${index % 2 === 0 ? '-' : ''}${3 + index}px 0 ${chaosColors[(index + 2) % chaosColors.length]},
                  0 ${index % 2 === 0 ? '-' : ''}${2 + index}px ${chaosColors[(index + 1) % chaosColors.length]}
                `,
                animation: [
                  `chaos-glitch-${index % 3} ${0.8 + index * 0.2}s infinite`,
                  `chaos-drift ${3 + index}s ease-in-out infinite`
                ].join(', '),
                zIndex: digits.length - index
              }}
            >
              {digit}
            </span>
          ))}
        </div>

        {/* 故障艺术元素 - 随机出现 */}
        {Math.random() > 0.7 && (
          <div style={{
            ...styles_chaos.glitchBlock,
            left: `${Math.random() * 80}%`,
            top: `${Math.random() * 80}%`,
            background: chaosColors[Math.floor(Math.random() * chaosColors.length)],
            animation: 'chaos-flash 0.1s forwards'
          }} />
        )}

        {/* 碰撞几何图形装饰 */}
        <div style={{
          ...styles_chaos.collisionCircle,
          borderColor: chaosColors[3],
          animation: 'chaos-collide 2s ease-in-out infinite'
        }} />
        <div style={{
          ...styles_chaos.collisionTriangle,
          borderBottomColor: chaosColors[4],
          transform: `rotate(${chaosAngles[5]}deg)`
        }} />

        {/* 混乱进度条 */}
        <div style={styles_chaos.chaosProgressBar}>
          <div style={{
            ...styles_chaos.chaosProgressFill,
            width: `${progressPercent}%`,
            background: `repeating-linear-gradient(
              45deg,
              ${chaosColors[0]},
              ${chaosColors[0]} 10px,
              ${chaosColors[1]} 10px,
              ${chaosColors[1]} 20px
            )`
          }} />
        </div>

        {/* 解构主义标签 */}
        <div style={styles_chaos.deconstructLabel}>
          <span style={{
            color: chaosColors[Math.floor(Date.now() / 500) % chaosColors.length],
            animation: 'chaos-color-shift 0.5s infinite'
          }}>
            #{countdown.toString().padStart(3, '0')}
          </span>
        </div>

        {refreshing && (
          <div style={styles_chaos.refreshingChaos}>
            {['⚡', '💥', '🔥'].map((icon, i) => (
              <span key={i} style={{
                display: 'inline-block',
                animation: `chaos-explode ${0.3 + i * 0.1}s ease-in-out infinite`,
                animationDelay: `${i * 0.1}s`,
                fontSize: `${14 + i * 4}px`
              }}>{icon}</span>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ==================== 11. Flip Clock Classic (经典翻牌时钟) ====================
  const renderFlipClock = () => {
    const digit = Math.min(countdown, 99);
    const tens = Math.floor(digit / 10);
    const ones = digit % 10;

    return (
      <div style={styles_flip.container}>
        <div style={styles_flip.cardGroup}>
          {/* 十位 */}
          <div style={styles_flip.card}>
            <div style={styles_flip.cardTop}>
              <span style={styles_flip.digit}>{tens}</span>
            </div>
            <div style={styles_flip.cardDivider} />
            <div style={styles_flip.cardBottom}>
              <span style={styles_flip.digit}>{tens}</span>
            </div>
          </div>

          {/* 个位 */}
          <div style={styles_flip.card}>
            <div style={styles_flip.cardTop}>
              <span style={styles_flip.digit}>{ones}</span>
            </div>
            <div style={styles_flip.cardDivider} />
            <div style={styles_flip.cardBottom}>
              <span style={styles_flip.digit}>{ones}</span>
            </div>
          </div>
        </div>

        {/* 翻转动画指示器 */}
        {refreshing && (
          <div style={styles_flip.flippingIndicator}>
            <span style={{ animation: 'flip-spin 0.6s ease-in-out infinite' }}>↻</span>
          </div>
        )}
      </div>
    );
  };

  // ==================== 12. Particle Explosion (粒子爆炸) ====================
  const renderParticleExplosion = () => {
    const particleCount = 12;
    const colors = ['#FF0040', '#00FFFF', '#FFFF00', '#FF00FF', '#00FF41', '#FF6600'];

    return (
      <div style={styles_particle.container}>
        {/* 粒子环绕 */}
        {[...Array(particleCount)].map((_, i) => {
          const angle = (i * 360 / particleCount) * (Math.PI / 180);
          const radius = 35 + (progressPercent / 100) * 10;
          const x = Math.cos(angle + (Date.now() / 2000)) * radius;
          const y = Math.sin(angle + (Date.now() / 2000)) * radius;

          return (
            <div key={i} style={{
              position: 'absolute',
              width: `${6 + (i % 3) * 2}px`,
              height: `${6 + (i % 3) * 2}px`,
              borderRadius: '50%',
              background: colors[i % colors.length],
              left: '50%',
              top: '50%',
              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
              boxShadow: `0 0 ${8 + i}px ${colors[i % colors.length]}`,
              animation: `particle-pulse ${1 + (i % 4) * 0.3}s ease-in-out infinite`,
              animationDelay: `${i * 0.1}s`
            }} />
          );
        })}

        {/* 中心数字 */}
        <div style={styles_particle.centerNumber}>
          {countdown}
        </div>

        {/* 进度环 - 粒子轨迹 */}
        <svg width="110" height="110" viewBox="0 0 110 110" style={{ position: 'absolute', top: 0, left: 0 }}>
          <circle cx="55" cy="55" r="45" fill="none"
            stroke="url(#particleGradient)"
            strokeWidth="2"
            strokeDasharray={`${progressPercent * 2.83}, 283`}
            strokeLinecap="round"
            transform="rotate(-90 55 55)"
            opacity="0.6"
          />
          <defs>
            <linearGradient id="particleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FF0040" />
              <stop offset="50%" stopColor="#00FFFF" />
              <stop offset="100%" stopColor="#FFFF00" />
            </linearGradient>
          </defs>
        </svg>

        {refreshing && (
          <div style={styles_particle.explosionEffect}>
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{
                position: 'absolute',
                width: '4px',
                height: '4px',
                borderRadius: '50%',
                background: colors[i % colors.length],
                animation: `explode-out 0.8s ease-out ${i * 0.05}s both`
              }} />
            ))}
          </div>
        )}
      </div>
    );
  };

  // ==================== 13. Geometric Orbital (几何轨道) ====================
  const renderGeometricOrbital = () => {
    return (
      <div style={styles_orbital.container}>
        {/* 外层轨道环 */}
        <div style={{
          ...styles_orbital.ring,
          width: '105px',
          height: '105px',
          borderColor: 'rgba(255, 0, 64, 0.4)',
          animation: 'orbital-spin-1 8s linear infinite'
        }} />

        {/* 中层轨道环 */}
        <div style={{
          ...styles_orbital.ring,
          width: '85px',
          height: '85px',
          borderColor: 'rgba(0, 255, 255, 0.5)',
          animation: 'orbital-spin-2 6s linear infinite reverse'
        }} />

        {/* 内层轨道环 */}
        <div style={{
          ...styles_orbital.ring,
          width: '65px',
          height: '65px',
          borderColor: 'rgba(255, 255, 0, 0.6)',
          animation: 'orbital-spin-3 4s linear infinite'
        }} />

        {/* 轨道行星点 */}
        <div style={{
          ...styles_orbital.planet,
          background: '#FF0040',
          animation: 'orbit-1 8s linear infinite',
          boxShadow: '0 0 10px #FF0040'
        }} />
        <div style={{
          ...styles_orbital.planet,
          background: '#00FFFF',
          width: '6px',
          height: '6px',
          animation: 'orbit-2 6s linear infinite reverse',
          boxShadow: '0 0 8px #00FFFF'
        }} />
        <div style={{
          ...styles_orbital.planet,
          background: '#FFFF00',
          width: '5px',
          height: '5px',
          animation: 'orbit-3 4s linear infinite',
          boxShadow: '0 0 6px #FFFF00'
        }} />

        {/* 中心核心 */}
        <div style={styles_orbital.core}>
          <span style={styles_orbital.coreNumber}>{countdown}</span>
        </div>

        {refreshing && (
          <div style={styles_orbital.warpEffect}>
            <div style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              border: '2px solid rgba(138, 43, 226, 0.8)',
              borderRadius: '50%',
              animation: 'warp-pulse 0.5s ease-in-out infinite'
            }} />
          </div>
        )}
      </div>
    );
  };

  // ==================== 14. Pulse Wave Ripple (脉冲波纹) ====================
  const renderPulseRipple = () => {
    const rippleCount = 3;
    const isUrgent = countdown <= 5;

    return (
      <div style={styles_ripple.container}>
        {/* 多层涟漪波纹 */}
        {[...Array(rippleCount)].map((_, i) => (
          <div key={i} style={{
            ...styles_ripple.rippleRing,
            width: `${60 + i * 20}px`,
            height: `${60 + i * 20}px`,
            borderColor: isUrgent
              ? `rgba(255, 0, 64, ${0.6 - i * 0.15})`
              : `rgba(0, 200, 255, ${0.6 - i * 0.15})`,
            animation: `ripple-expand-${i + 1} ${2 + i * 0.5}s ease-out infinite`,
            animationDelay: `${i * 0.3}s`
          }} />
        ))}

        {/* 中心脉冲核心 */}
        <div style={{
          ...styles_ripple.pulseCore,
          background: isUrgent
            ? 'radial-gradient(circle, rgba(255, 0, 64, 0.9) 0%, rgba(255, 0, 64, 0.3) 70%)'
            : 'radial-gradient(circle, rgba(0, 200, 255, 0.9) 0%, rgba(0, 200, 255, 0.3) 70%)',
          animation: isUrgent ? 'pulse-core-urgent 0.5s ease-in-out infinite' : 'pulse-core 2s ease-in-out infinite'
        }}>
          <span style={styles_ripple.coreNumber}>{countdown}</span>
        </div>

        {/* 进度指示弧线 */}
        <svg width="120" height="120" viewBox="0 0 120 120" style={{ position: 'absolute', top: 0, left: 0 }}>
          <circle cx="60" cy="60" r="52" fill="none"
            stroke={isUrgent ? '#ff0040' : '#00c8ff'}
            strokeWidth="3"
            strokeDasharray={`${progressPercent * 3.27}, 327`}
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
            opacity="0.8"
            style={{
              filter: `drop-shadow(0 0 ${isUrgent ? '8px' : '5px'} ${isUrgent ? '#ff0040' : '#00c8ff'})`,
              transition: 'stroke-dashoffset 1s linear'
            }}
          />
        </svg>

        {refreshing && (
          <div style={styles_ripple.shockwave}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                border: '2px solid rgba(255, 255, 255, 0.6)',
                borderRadius: '50%',
                animation: `shockwave-burst 0.6s ease-out ${i * 0.1}s both`
              }} />
            ))}
          </div>
        )}
      </div>
    );
  };

  // ==================== 15. Digital Matrix Rain (数字矩阵雨) ====================
  const renderMatrixRain = () => {
    const matrixChars = ['0', '1', '0', '1', countdown.toString()[0] || '0'];
    const columns = 7;

    return (
      <div style={styles_matrix.container}>
        {/* 矩阵雨背景 */}
        <div style={styles_matrix.rainContainer}>
          {[...Array(columns)].map((_, colIndex) => (
            <div key={colIndex} style={styles_matrix.column}>
              {[...Array(8)].map((_, rowIndex) => (
                <div
                  key={`${colIndex}-${rowIndex}`}
                  style={{
                    ...styles_matrix.char,
                    color: rowIndex === 0 ? '#00ff41' : `rgba(0, 255, 65, ${0.3 + Math.random() * 0.5})`,
                    textShadow: rowIndex === 0 ? '0 0 8px #00ff41' : 'none',
                    animation: `matrix-fall ${1.5 + colIndex * 0.3}s linear infinite`,
                    animationDelay: `${colIndex * 0.2 + rowIndex * 0.1}s`,
                    opacity: rowIndex === 0 ? 1 : 0.4 + Math.random() * 0.4
                  }}
                >
                  {matrixChars[(colIndex + rowIndex) % matrixChars.length]}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 中心显示区域 */}
        <div style={styles_matrix.displayArea}>
          <div style={styles_matrix.matrixBorder}>
            <span style={styles_matrix.displayNumber}>{countdown}</span>
          </div>

          {/* 进度条 - 二进制风格 */}
          <div style={styles_matrix.binaryProgress}>
            {[...Array(16)].map((_, i) => (
              <div key={i} style={{
                width: '4px',
                height: '12px',
                background: i < Math.floor(progressPercent / 6.25) ? '#00ff41' : 'rgba(0, 255, 65, 0.15)',
                boxShadow: i < Math.floor(progressPercent / 6.25) ? '0 0 4px #00ff41' : 'none',
                transition: 'background 0.3s ease'
              }} />
            ))}
          </div>
        </div>

        {refreshing && (
          <div style={styles_matrix.hackingText}>
            <span style={{ animation: 'matrix-glitch 0.3s infinite' }}>HACKING...</span>
          </div>
        )}
      </div>
    );
  };

  // ==================== 16. Mechanical Gauge (机械仪表盘) ====================
  const renderMechanicalGauge = () => {
    // 计算指针角度（从-90度到90度）
    const angle = -90 + (progressPercent / 100) * 180;
    const isWarning = progressPercent > 80;
    const isDanger = progressPercent > 95;

    return (
      <div style={styles_gauge.container}>
        {/* 仪表盘外框 */}
        <div style={styles_gauge.bezel}>
          {/* 刻度盘背景 */}
          <svg width="130" height="75" viewBox="0 0 130 75" style={{ position: 'absolute', top: 0, left: 0 }}>
            {/* 刻度弧 */}
            <path d="M 15 65 A 50 50 0 0 1 115 65"
              fill="none"
              stroke="rgba(255, 255, 255, 0.2)"
              strokeWidth="2"
            />

            {/* 刻度线 */}
            {[...Array(11)].map((_, i) => {
              const tickAngle = (-90 + i * 18) * (Math.PI / 180);
              const innerRadius = i % 5 === 0 ? 38 : 42;
              const outerRadius = 48;
              const x1 = 65 + innerRadius * Math.cos(tickAngle);
              const y1 = 65 + innerRadius * Math.sin(tickAngle);
              const x2 = 65 + outerRadius * Math.cos(tickAngle);
              const y2 = 65 + outerRadius * Math.sin(tickAngle);

              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={i >= 9 ? '#ff0040' : i >= 7 ? '#ffcc00' : '#ffffff'}
                  strokeWidth={i % 5 === 0 ? 2 : 1}
                  opacity={0.6}
                />
              );
            })}

            {/* 指针 */}
            <line
              x1="65"
              y1="65"
              x2={65 + 40 * Math.cos(angle * Math.PI / 180)}
              y2={65 + 40 * Math.sin(angle * Math.PI / 180)}
              stroke={isDanger ? '#ff0040' : isWarning ? '#ffcc00' : '#00ff41'}
              strokeWidth="3"
              strokeLinecap="round"
              style={{
                filter: `drop-shadow(0 0 ${isDanger ? '6px' : '3px'} ${isDanger ? '#ff0040' : isWarning ? '#ffcc00' : '#00ff41'})`,
                transition: 'stroke 0.3s ease'
              }}
            />

            {/* 中心轴点 */}
            <circle cx="65" cy="65" r="5" fill="#333" stroke="#666" strokeWidth="2" />
          </svg>

          {/* 数字显示窗口 */}
          <div style={styles_gauge.displayWindow}>
            <span style={{
              ...styles_gauge.displayNumber,
              color: isDanger ? '#ff0040' : isWarning ? '#ffcc00' : '#00ff41',
              textShadow: `0 0 ${isDanger ? '10px' : '6px'} ${isDanger ? '#ff0040' : isWarning ? '#ffcc00' : '#00ff41'}`
            }}>
              {String(countdown).padStart(2, '0')}
            </span>
          </div>

          {/* 状态标签 */}
          <div style={{
            ...styles_gauge.statusLabel,
            color: isDanger ? '#ff0040' : isWarning ? '#ffcc00' : '#00ff41'
          }}>
            {isDanger ? 'CRITICAL' : isWarning ? 'WARNING' : 'NORMAL'}
          </div>
        </div>

        {refreshing && (
          <div style={styles_gauge.calibrating}>
            <span style={{ animation: 'gauge-calibrate 0.5s ease-in-out infinite' }}>⚙</span>
          </div>
        )}
      </div>
    );
  };

  // 渲染对应风格的按钮
  const renderButton = (type: string) => {
    switch (type) {
      case 'futuristic':
        return renderFuturisticHUD();
      case 'liquid-glass':
        return renderLiquidGlass();
      case 'retro-arcade':
        return renderRetroArcade();
      case 'holographic-glitch':
        return renderHolographicGlitch();
      case 'digital-led':
        return renderDigitalLED();
      case 'bioluminescence':
        return renderBioluminescence();
      case 'kinetic-typography':
        return renderKineticTypography();
      case 'morphing-shape':
        return renderMorphingShape();
      case 'skeuomorphic-power':
        return renderSkeuomorphicPower();
      case 'chaos-packaging':
        return renderChaosPackaging();
      case 'flip-clock':
        return renderFlipClock();
      case 'particle-explosion':
        return renderParticleExplosion();
      case 'geometric-orbital':
        return renderGeometricOrbital();
      case 'pulse-ripple':
        return renderPulseRipple();
      case 'matrix-rain':
        return renderMatrixRain();
      case 'mechanical-gauge':
        return renderMechanicalGauge();
      default:
        return null;
    }
  };

  return (
    <div style={showcaseStyles.container}>
      <div style={showcaseStyles.grid}>
        {styles.map((style, index) => (
          <div key={index} style={showcaseStyles.card}>
            <h3 style={showcaseStyles.title}>{style.name}</h3>
            <p style={showcaseStyles.description}>{style.description}</p>

            <div style={showcaseStyles.buttonPreview}>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                style={{
                  ...showcaseStyles.button,
                  cursor: refreshing ? 'not-allowed' : 'pointer',
                  opacity: refreshing ? 0.7 : 1
                }}
              >
                {renderButton(style.type)}
              </button>
            </div>

            <div style={showcaseStyles.countdownInfo}>
              <span>倒计时: <strong>{countdown}s</strong></span>
              <span>刷新频率: <strong>{refreshFreq}s</strong></span>
              <span>进度: <strong>{Math.round(progressPercent)}%</strong></span>
            </div>
          </div>
        ))}
      </div>

      <style>{keyframesCSS}</style>
    </div>
  );
};

// ==================== 样式定义 ====================

// 全局展示样式
const showcaseStyles = {
  container: {
    padding: '40px 20px',
    background: 'linear-gradient(135deg, #0a0f1e 0%, #1a1f35 100%)',
    minHeight: '100vh',
    fontFamily: "'Courier New', monospace",
    color: '#ffffff'
  } as React.CSSProperties,

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '24px',
    maxWidth: '1600px',
    margin: '0 auto',
    '@media (max-width: 1200px)': {
      gridTemplateColumns: 'repeat(2, 1fr)'
    },
    '@media (max-width: 768px)': {
      gridTemplateColumns: '1fr'
    }
  } as React.CSSProperties,

  card: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '16px',
    padding: '28px',
    backdropFilter: 'blur(10px)',
    transition: 'transform 0.3s ease, box-shadow 0.3s ease',
    ':hover': {
      transform: 'translateY(-4px)',
      boxShadow: '0 20px 40px rgba(0, 200, 255, 0.15)'
    }
  } as React.CSSProperties,

  title: {
    fontSize: '22px',
    fontWeight: 700,
    marginBottom: '8px',
    background: 'linear-gradient(135deg, #00d4ff, #7b2fff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '-0.5px'
  } as React.CSSProperties,

  description: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: '24px',
    lineHeight: 1.5
  } as React.CSSProperties,

  buttonPreview: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '120px',
    marginBottom: '20px',
    padding: '20px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '12px',
    border: '1px dashed rgba(255, 255, 255, 0.1)'
  } as React.CSSProperties,

  button: {
    background: 'transparent',
    border: 'none',
    padding: 0,
    outline: 'none',
    position: 'relative' as const,
    transition: 'opacity 0.3s ease'
  } as React.CSSProperties,

  countdownInfo: {
    display: 'flex',
    justifyContent: 'space-around',
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.6)',
    padding: '12px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '8px',
    gap: '8px',
    flexWrap: 'wrap' as const
  } as React.CSSProperties
};

// 1. Futuristic HUD 样式
const styles_futuristic = {
  container: {
    position: 'relative' as const,
    width: '100px',
    height: '100px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'transform 0.3s ease',
    ':hover': {
      transform: 'scale(1.05)'
    }
  } as React.CSSProperties,

  number: {
    position: 'absolute' as const,
    fontSize: '28px',
    fontFamily: "'Orbitron', 'Courier New', monospace",
    fontWeight: 700,
    zIndex: 2,
    transition: 'color 0.3s ease, text-shadow 0.3s ease'
  } as React.CSSProperties,

  refreshingOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    animation: 'pulse-future 1s infinite'
  } as React.CSSProperties,

  refreshingText: {
    fontSize: '9px',
    color: '#00ffff',
    fontWeight: 700,
    letterSpacing: '2px',
    animation: 'blink 0.5s infinite'
  } as React.CSSProperties
};

// 2. Liquid Glass 样式
const styles_liquidGlass = {
  container: {
    position: 'relative' as const,
    width: '100px',
    height: '100px',
    borderRadius: '20px',
    overflow: 'hidden',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.3s ease',
    ':hover': {
      transform: 'scale(1.05) rotateX(5deg)'
    }
  } as React.CSSProperties,

  glassLayer: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.05) 50%, rgba(138, 43, 226, 0.15) 100%)',
    backdropFilter: 'blur(20px) saturate(180%)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '20px',
    boxShadow: '0 8px 32px rgba(138, 43, 226, 0.2), inset 0 0 20px rgba(255, 255, 255, 0.1)'
  } as React.CSSProperties,

  highlightTop: {
    position: 'absolute' as const,
    top: '10%',
    left: '15%',
    right: '15%',
    height: '30%',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, transparent 100%)',
    borderRadius: '50%',
    filter: 'blur(8px)'
  } as React.CSSProperties,

  highlightBottom: {
    position: 'absolute' as const,
    bottom: '15%',
    left: '20%',
    width: '40%',
    height: '15%',
    background: 'linear-gradient(0deg, rgba(255,255,255,0.3) 0%, transparent 100%)',
    borderRadius: '50%',
    filter: 'blur(5px)'
  } as React.CSSProperties,

  ripple: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    width: '0',
    height: '0',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(138, 43, 226, 0.4) 0%, transparent 70%)',
    transform: 'translate(-50%, -50%)',
    animation: 'ripple-expand 1s ease-out forwards'
  } as React.CSSProperties,

  number: {
    position: 'relative' as const,
    zIndex: 2,
    fontSize: '36px',
    fontWeight: 700,
    fontFamily: "'SF Pro Display', -apple-system, sans-serif",
    background: 'linear-gradient(180deg, #ffffff 0%, #a78bfa 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    textShadow: '0 2px 10px rgba(138, 43, 226, 0.5)',
    marginBottom: '4px'
  } as React.CSSProperties,

  progressBar: {
    position: 'relative' as const,
    width: '60px',
    height: '4px',
    background: 'rgba(255, 255, 255, 0.2)',
    borderRadius: '2px',
    overflow: 'hidden',
    zIndex: 2
  } as React.CSSProperties,

  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #8b5cf6, #06b6d4)',
    borderRadius: '2px',
    transition: 'width 1s linear',
    boxShadow: '0 0 8px rgba(139, 92, 246, 0.8)'
  } as React.CSSProperties,

  refreshingIcon: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: '32px',
    color: 'rgba(255, 255, 255, 0.8)',
    animation: 'spin 1s linear infinite',
    zIndex: 3
  } as React.CSSProperties
};

// 3. Retro Arcade 样式
const styles_retroArcade = {
  container: {
    position: 'relative' as const,
    width: '100px',
    height: '100px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'transform 0.2s ease',
    ':hover': {
      transform: 'scale(1.02)'
    }
  } as React.CSSProperties,

  scanlines: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 0, 0, 0.15) 2px, rgba(0, 0, 0, 0.15) 4px)',
    pointerEvents: 'none',
    zIndex: 3
  } as React.CSSProperties,

  neonBorder: {
    position: 'relative' as const,
    width: '85px',
    height: '85px',
    border: '3px solid',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    background: '#000000',
    padding: '8px',
    gap: '6px'
  } as React.CSSProperties,

  number: {
    fontSize: '38px',
    fontFamily: "'Press Start 2P', 'Courier New', monospace",
    fontWeight: 700,
    lineHeight: 1
  } as React.CSSProperties,

  progressBar: {
    width: '100%',
    height: '6px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '3px',
    overflow: 'hidden'
  } as React.CSSProperties,

  progressFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 1s linear',
    boxShadow: '0 0 10px currentColor'
  } as React.CSSProperties,

  refreshingText: {
    position: 'absolute' as const,
    bottom: '-24px',
    fontSize: '11px',
    fontFamily: "'Press Start 2P', monospace",
    color: '#FFFF00',
    textShadow: '0 0 5px #FFFF00, 0 0 10px #FFFF00',
    animation: 'blink 0.3s infinite',
    whiteSpace: 'nowrap' as const
  } as React.CSSProperties
};

// 4. Holographic Glitch 样式
const styles_glitch = {
  container: {
    position: 'relative' as const,
    width: '100px',
    height: '100px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    background: 'rgba(0, 255, 255, 0.03)',
    border: '1px solid rgba(0, 255, 255, 0.2)',
    borderRadius: '12px',
    transition: 'transform 0.2s ease',
    ':hover': {
      transform: 'skewX(-2deg) translateX(2px)',
      animation: 'glitch-skew 0.3s infinite'
    }
  } as React.CSSProperties,

  scanLine: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: '3px',
    background: 'rgba(0, 255, 255, 0.6)',
    animation: 'scan-down 2s linear infinite',
    boxShadow: '0 0 10px rgba(0, 255, 255, 0.8)',
    zIndex: 4
  } as React.CSSProperties,

  rgbLayer: {
    position: 'absolute' as const,
    fontSize: '42px',
    fontFamily: "'Share Tech Mono', 'Courier New', monospace",
    fontWeight: 700,
    opacity: 0.8,
    mixBlendMode: 'screen' as const,
    transition: 'transform 0.1s ease'
  } as React.CSSProperties,

  glitchText: {
    position: 'absolute' as const,
    bottom: '8px',
    fontSize: '10px',
    fontFamily: "'Share Tech Mono', monospace",
    color: '#ff0040',
    fontWeight: 700,
    letterSpacing: '3px',
    animation: 'glitch-text 0.5s infinite',
    textShadow: '2px 0 #00ff00, -2px 0 #0088ff'
  } as React.CSSProperties
};

// 5. Digital LED 样式
const styles_led = {
  container: {
    position: 'relative' as const,
    width: '120px',
    height: '80px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    padding: '8px',
    background: '#0a0a0a',
    border: '2px solid #333',
    borderRadius: '8px',
    transition: 'border-color 0.3s ease',
    ':hover': {
      borderColor: '#ff0040'
    }
  } as React.CSSProperties,

  digitContainer: {
    position: 'relative' as const,
    width: '48px',
    height: '70px',
    margin: '0 2px'
  } as React.CSSProperties,

  dotMatrix: {
    display: 'flex',
    gap: '3px',
    marginTop: '4px'
  } as React.CSSProperties,

  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    transition: 'all 0.3s ease'
  } as React.CSSProperties,

  refreshingIndicator: {
    position: 'absolute' as const,
    top: '4px',
    right: '4px',
    fontSize: '8px',
    color: '#00ff41',
    animation: 'led-blink 0.5s infinite'
  } as React.CSSProperties
};

// 6. Bioluminescence 样式
const styles_bio = {
  container: {
    position: 'relative' as const,
    width: '110px',
    height: '110px',
    borderRadius: '55px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    overflow: 'hidden',
    transition: 'transform 0.4s ease',
    ':hover': {
      transform: 'scale(1.08)'
    }
  } as React.CSSProperties,

  organicBg: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'radial-gradient(circle at 30% 30%, rgba(59, 130, 246, 0.3) 0%, rgba(147, 51, 234, 0.2) 50%, rgba(236, 72, 153, 0.15) 100%)',
    filter: 'blur(20px)',
    animation: 'bio-pulse 3s ease-in-out infinite'
  } as React.CSSProperties,

  fluidBorder: {
    position: 'absolute' as const,
    top: '4px',
    left: '4px',
    right: '4px',
    bottom: '4px',
    borderRadius: '51px',
    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.4) 0%, rgba(147, 51, 234, 0.4) 33%, rgba(236, 72, 153, 0.4) 66%, rgba(59, 130, 246, 0.4) 100%)',
    backgroundSize: '300% 300%',
    animation: 'fluid-rotate 4s linear infinite',
    filter: 'blur(1px)'
  } as React.CSSProperties,

  pulseGlow: {
    position: 'absolute' as const,
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(147, 51, 234, 0.4) 0%, transparent 70%)',
    animation: 'bio-pulse 2s ease-in-out infinite alternate'
  } as React.CSSProperties,

  number: {
    position: 'relative' as const,
    zIndex: 2,
    fontSize: '38px',
    fontFamily: "'Quicksand', -apple-system, sans-serif",
    fontWeight: 700,
    background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #f472b6 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    filter: 'drop-shadow(0 0 15px rgba(167, 139, 250, 0.6))',
    marginBottom: '6px'
  } as React.CSSProperties,

  organicProgress: {
    position: 'relative' as const,
    width: '65px',
    height: '8px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
    overflow: 'hidden',
    zIndex: 2
  } as React.CSSProperties,

  progressBlob: {
    height: '100%',
    background: 'linear-gradient(90deg, #3b82f6, #9333ea, #ec4899)',
    borderRadius: '10px',
    transition: 'width 1s ease',
    boxShadow: '0 0 12px rgba(147, 51, 234, 0.8)',
    filter: 'blur(0.5px)'
  } as React.CSSProperties,

  particles: {
    position: 'absolute' as const,
    bottom: '12px',
    display: 'flex',
    gap: '4px',
    fontSize: '8px',
    color: '#f472b6',
    zIndex: 2
  } as React.CSSProperties
};

// 7. Kinetic Typography 样式 (动态字体)
const styles_kinetic = {
  container: {
    position: 'relative' as const,
    width: '120px',
    height: '110px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: '12px',
    background: 'rgba(0, 0, 0, 0.6)',
    borderRadius: '16px',
    border: '2px solid rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    transition: 'transform 0.3s ease, box-shadow 0.3s ease',
    ':hover': {
      transform: 'scale(1.08)',
      boxShadow: '0 0 30px rgba(255, 255, 255, 0.2)'
    }
  } as React.CSSProperties,

  bgGlow: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.6,
    animation: 'kinetic-glow-rotate 4s linear infinite'
  } as React.CSSProperties,

  digitsContainer: {
    position: 'relative' as const,
    display: 'flex',
    gap: '2px',
    zIndex: 2,
    marginBottom: '8px'
  } as React.CSSProperties,

  digit: {
    display: 'inline-block',
    fontFamily: "'Arial Black', 'Impact', sans-serif",
    fontWeight: 900,
    lineHeight: 1,
    transition: 'font-size 0.3s ease'
  } as React.CSSProperties,

  progressBar: {
    position: 'relative' as const,
    width: '80px',
    height: '6px',
    background: 'rgba(255, 255, 255, 0.15)',
    borderRadius: '3px',
    overflow: 'hidden',
    zIndex: 2
  } as React.CSSProperties,

  progressFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 1s ease',
    boxShadow: '0 0 10px currentColor'
  } as React.CSSProperties,

  urgentIndicator: {
    position: 'absolute' as const,
    top: '8px',
    right: '8px',
    zIndex: 3
  } as React.CSSProperties,

  refreshingOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
    backdropFilter: 'blur(4px)'
  } as React.CSSProperties,

  refreshingText: {
    fontSize: '11px',
    fontWeight: 900,
    color: '#ffffff',
    letterSpacing: '3px',
    animation: 'kinetic-blink-fast 0.2s infinite'
  } as React.CSSProperties
};

// 8. Morphing Shape-Shifting 样式 (变形变换)
const styles_morphing = {
  outerContainer: {
    position: 'relative' as const,
    width: '115px',
    height: '115px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  } as React.CSSProperties,

  morphBody: {
    position: 'relative' as const,
    width: '95px',
    height: '95px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    transition: 'all 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    boxShadow: '0 10px 40px rgba(147, 51, 234, 0.4), inset 0 0 20px rgba(255, 255, 255, 0.1)'
  } as React.CSSProperties,

  liquidSurface: {
    position: 'absolute' as const,
    top: '0',
    left: '0',
    right: '0',
    height: '40%',
    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.3) 0%, transparent 100%)',
    borderRadius: '50%',
    filter: 'blur(8px)',
    pointerEvents: 'none'
  } as React.CSSProperties,

  floatingNumber: {
    position: 'relative' as const,
    zIndex: 2,
    fontSize: '34px',
    fontWeight: 900,
    fontFamily: "'Arial Black', sans-serif",
    color: '#ffffff',
    textShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
    marginBottom: '6px'
  } as React.CSSProperties,

  liquidProgress: {
    position: 'relative' as const,
    width: '70px',
    height: '6px',
    background: 'rgba(255, 255, 255, 0.2)',
    borderRadius: '3px',
    overflow: 'hidden',
    zIndex: 2
  } as React.CSSProperties,

  liquidFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 1s ease',
    boxShadow: '0 0 12px currentColor'
  } as React.CSSProperties,

  splashEffect: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    zIndex: 3
  } as React.CSSProperties,

  refreshingIndicator: {
    position: 'absolute' as const,
    bottom: '8px',
    zIndex: 3,
    fontSize: '18px',
    color: '#ffffff'
  } as React.CSSProperties
};

// 9. Skeuomorphic Retro Power 样式 (拟物复古力量按钮)
const styles_skeuo = {
  outerContainer: {
    position: 'relative' as const,
    width: '140px',
    height: '150px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: '16px'
  } as React.CSSProperties,

  metalCasing: {
    position: 'relative' as const,
    width: '108px',
    height: '118px',
    background: 'linear-gradient(145deg, #4a4a4a 0%, #2a2a2a 50%, #1a1a1a 100%)',
    borderRadius: '12px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '10px',
    boxShadow: `
      0 12px 24px rgba(0, 0, 0, 0.8),
      0 6px 12px rgba(0, 0, 0, 0.6),
      inset 0 2px 4px rgba(255, 255, 255, 0.1),
      inset 0 -2px 4px rgba(0, 0, 0, 0.5)
    `,
    border: '3px solid #333'
  } as React.CSSProperties,

  ledRecess: {
    width: '84px',
    height: '52px',
    background: '#0a0a0a',
    borderRadius: '6px',
    border: '2px solid #222',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '6px',
    boxShadow: `
      inset 0 4px 8px rgba(0, 0, 0, 0.9),
      inset 0 2px 4px rgba(0, 0, 0, 0.7)
    `
  } as React.CSSProperties,

  ledDisplay: {
    fontSize: '26px',
    fontFamily: "'Courier New', monospace",
    fontWeight: 900,
    letterSpacing: '2px',
    lineHeight: 1
  } as React.CSSProperties,

  mechanicalScale: {
    width: '72px',
    height: '8px',
    background: '#111',
    borderRadius: '2px',
    overflow: 'hidden',
    border: '1px solid #333'
  } as React.CSSProperties,

  scaleFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 1s ease',
    boxShadow: '0 0 8px currentColor'
  } as React.CSSProperties,

  powerButton: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    border: 'none',
    background: 'linear-gradient(145deg, #666 0%, #444 50%, #222 100%)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    outline: 'none',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease'
  } as React.CSSProperties,

  powerIcon: {
    fontSize: '24px',
    filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5))'
  } as React.CSSProperties,

  indicatorLED: {
    position: 'absolute' as const,
    top: '18px',
    right: '18px',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    transition: 'background 0.3s ease, box-shadow 0.3s ease'
  } as React.CSSProperties,

  bevelHighlight: {
    position: 'absolute' as const,
    top: '2px',
    left: '2px',
    right: '2px',
    height: '50%',
    borderRadius: '10px 10px 0 0',
    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, transparent 100%)',
    pointerEvents: 'none'
  } as React.CSSProperties,

  bevelShadow: {
    position: 'absolute' as const,
    bottom: '2px',
    left: '2px',
    right: '2px',
    height: '50%',
    borderRadius: '0 0 10px 10px',
    background: 'linear-gradient(0deg, rgba(0, 0, 0, 0.3) 0%, transparent 100%)',
    pointerEvents: 'none'
  } as React.CSSProperties
};

// 10. Chaos Packaging 样式 (混乱包装/解构主义)
const styles_chaos = {
  container: {
    position: 'relative' as const,
    width: '125px',
    height: '125px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    background: 'rgba(10, 10, 10, 0.9)',
    border: '3px solid rgba(255, 0, 64, 0.3)',
    overflow: 'visible',
    transition: 'transform 0.2s ease',
    ':hover': {
      transform: 'rotate(1deg) scale(1.02)'
    }
  } as React.CSSProperties,

  noiseTexture: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E")`,
    pointerEvents: 'none',
    zIndex: 1,
    opacity: 0.6
  } as React.CSSProperties,

  geoShape1: {
    position: 'absolute' as const,
    top: '-8px',
    left: '-8px',
    width: '30px',
    height: '30px',
    borderWidth: '3px',
    borderStyle: 'solid',
    borderRadius: '2px',
    transform: 'rotate(-12deg)',
    zIndex: 0
  } as React.CSSProperties,

  geoShape2: {
    position: 'absolute' as const,
    bottom: '-10px',
    right: '-6px',
    width: '35px',
    height: '35px',
    borderRadius: '50%',
    zIndex: 0
  } as React.CSSProperties,

  geoShape3: {
    position: 'absolute' as const,
    top: '50%',
    right: '-12px',
    width: '24px',
    height: '24px',
    borderWidth: '4px',
    borderStyle: 'solid',
    borderTop: 'none',
    borderLeft: 'none',
    transform: 'rotate(-5deg)',
    zIndex: 0
  } as React.CSSProperties,

  fragmentedDigits: {
    position: 'relative' as const,
    display: 'flex',
    gap: '0px',
    zIndex: 2,
    marginBottom: '10px',
    marginLeft: '8px'
  } as React.CSSProperties,

  chaosDigit: {
    display: 'inline-block',
    fontFamily: "'Impact', 'Arial Black', sans-serif",
    fontWeight: 900,
    lineHeight: 0.85,
    transition: 'transform 0.2s ease'
  } as React.CSSProperties,

  glitchBlock: {
    position: 'absolute' as const,
    width: '20px',
    height: '4px',
    zIndex: 3,
    pointerEvents: 'none'
  } as React.CSSProperties,

  collisionCircle: {
    position: 'absolute' as const,
    top: '6px',
    left: '6px',
    width: '18px',
    height: '18px',
    borderWidth: '3px',
    borderStyle: 'solid',
    borderRadius: '50%',
    zIndex: 0
  } as React.CSSProperties,

  collisionTriangle: {
    position: 'absolute' as const,
    bottom: '8px',
    left: '10px',
    width: 0,
    height: 0,
    borderLeft: '12px solid transparent',
    borderRight: '12px solid transparent',
    borderBottom: '20px solid',
    zIndex: 0
  } as React.CSSProperties,

  chaosProgressBar: {
    position: 'relative' as const,
    width: '85px',
    height: '8px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '2px',
    overflow: 'hidden',
    zIndex: 2,
    transform: 'rotate(-1deg)'
  } as React.CSSProperties,

  chaosProgressFill: {
    height: '100%',
    transition: 'width 1s ease',
    boxShadow: '0 0 8px currentColor'
  } as React.CSSProperties,

  deconstructLabel: {
    position: 'absolute' as const,
    bottom: '6px',
    right: '8px',
    fontSize: '10px',
    fontFamily: "'Courier New', monospace",
    fontWeight: 700,
    zIndex: 2,
    transform: 'rotate(3deg)'
  } as React.CSSProperties,

  refreshingChaos: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    gap: '4px',
    zIndex: 4
  } as React.CSSProperties
};

// 11. Flip Clock Classic 样式 (经典翻牌时钟)
const styles_flip = {
  container: {
    position: 'relative' as const,
    width: '90px',
    height: '70px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    perspective: '600px'
  } as React.CSSProperties,

  cardGroup: {
    display: 'flex',
    gap: '6px'
  } as React.CSSProperties,

  card: {
    position: 'relative' as const,
    width: '38px',
    height: '60px',
    backgroundColor: '#1a1a1a',
    borderRadius: '6px',
    overflow: 'hidden',
    boxShadow: `
      0 4px 8px rgba(0, 0, 0, 0.6),
      inset 0 0 20px rgba(0, 0, 0, 0.5),
      0 1px 0 rgba(255, 255, 255, 0.1)
    `,
    border: '1px solid #333'
  } as React.CSSProperties,

  cardTop: {
    position: 'absolute' as const,
    top: '0',
    left: '0',
    right: '0',
    height: '50%',
    background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingBottom: '4px',
    borderBottom: '2px solid #000',
    overflow: 'hidden',
    lineHeight: 1
  } as React.CSSProperties,

  cardBottom: {
    position: 'absolute' as const,
    bottom: '0',
    left: '0',
    right: '0',
    height: '50%',
    background: 'linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '4px',
    overflow: 'hidden',
    lineHeight: 1
  } as React.CSSProperties,

  cardDivider: {
    position: 'absolute' as const,
    top: '50%',
    left: '0',
    right: '0',
    height: '2px',
    background: '#000',
    transform: 'translateY(-50%)',
    zIndex: 3
  } as React.CSSProperties,

  digit: {
    fontSize: '36px',
    fontFamily: "'Courier New', monospace",
    fontWeight: 900,
    color: '#ffffff',
    textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)'
  } as React.CSSProperties,

  flippingIndicator: {
    position: 'absolute' as const,
    bottom: '-24px',
    fontSize: '16px',
    color: '#00d4ff',
    animation: 'flip-spin 0.6s ease-in-out infinite'
  } as React.CSSProperties
};

// 12. Particle Explosion 样式 (粒子爆炸)
const styles_particle = {
  container: {
    position: 'relative' as const,
    width: '110px',
    height: '110px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    borderRadius: '55px',
    background: 'radial-gradient(circle at center, rgba(20, 20, 40, 0.9) 0%, rgba(10, 10, 20, 0.95) 100%)',
    border: '1px solid rgba(138, 43, 226, 0.3)'
  } as React.CSSProperties,

  centerNumber: {
    position: 'relative' as const,
    zIndex: 3,
    fontSize: '32px',
    fontWeight: 900,
    fontFamily: "'Orbitron', monospace",
    color: '#ffffff',
    textShadow: '0 0 15px rgba(255, 255, 255, 0.8), 0 0 30px rgba(138, 43, 226, 0.6)'
  } as React.CSSProperties,

  explosionEffect: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: 4
  } as React.CSSProperties
};

// 13. Geometric Orbital 样式 (几何轨道)
const styles_orbital = {
  container: {
    position: 'relative' as const,
    width: '110px',
    height: '110px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    borderRadius: '55px'
  } as React.CSSProperties,

  ring: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'transparent'
  } as React.CSSProperties,

  planet: {
    position: 'absolute' as const,
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    top: '50%',
    left: '50%'
  } as React.CSSProperties,

  core: {
    position: 'relative' as const,
    width: '45px',
    height: '45px',
    borderRadius: '50%',
    background: 'radial-gradient(circle at 30% 30%, rgba(138, 43, 226, 0.9) 0%, rgba(75, 0, 130, 0.95) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
    boxShadow: '0 0 20px rgba(138, 43, 226, 0.8), inset 0 0 15px rgba(255, 255, 255, 0.2)',
    border: '2px solid rgba(167, 139, 250, 0.5)'
  } as React.CSSProperties,

  coreNumber: {
    fontSize: '22px',
    fontWeight: 900,
    color: '#ffffff',
    textShadow: '0 0 10px rgba(255, 255, 255, 0.9)'
  } as React.CSSProperties,

  warpEffect: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '120px',
    height: '120px',
    pointerEvents: 'none',
    zIndex: 5
  } as React.CSSProperties
};

// 14. Pulse Wave Ripple 样式 (脉冲波纹)
const styles_ripple = {
  container: {
    position: 'relative' as const,
    width: '120px',
    height: '120px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    borderRadius: '60px'
  } as React.CSSProperties,

  rippleRing: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    borderWidth: '2px',
    borderStyle: 'solid'
  } as React.CSSProperties,

  pulseCore: {
    position: 'relative' as const,
    width: '65px',
    height: '65px',
    borderRadius: '33px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    boxShadow: '0 0 30px currentColor'
  } as React.CSSProperties,

  coreNumber: {
    fontSize: '32px',
    fontWeight: 900,
    color: '#ffffff',
    textShadow: '0 0 15px currentColor'
  } as React.CSSProperties,

  shockwave: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: 4
  } as React.CSSProperties
};

// 15. Digital Matrix Rain 样式 (数字矩阵雨)
const styles_matrix = {
  container: {
    position: 'relative' as const,
    width: '115px',
    height: '130px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    background: 'rgba(0, 5, 0, 0.85)',
    border: '2px solid rgba(0, 255, 65, 0.3)',
    borderRadius: '8px',
    overflow: 'hidden',
    padding: '8px'
  } as React.CSSProperties,

  rainContainer: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'row' as const,
    padding: '4px',
    opacity: 0.7,
    pointerEvents: 'none'
  } as React.CSSProperties,

  column: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '2px'
  } as React.CSSProperties,

  char: {
    fontSize: '11px',
    fontFamily: "'Courier New', monospace",
    fontWeight: 700,
    transition: 'opacity 0.3s ease'
  } as React.CSSProperties,

  displayArea: {
    position: 'relative' as const,
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
    padding: '10px',
    background: 'rgba(0, 0, 0, 0.7)',
    borderRadius: '6px',
    border: '1px solid rgba(0, 255, 65, 0.4)'
  } as React.CSSProperties,

  matrixBorder: {
    padding: '8px 14px',
    background: 'linear-gradient(135deg, rgba(0, 255, 65, 0.1) 0%, rgba(0, 150, 50, 0.05) 100%)',
    borderRadius: '4px',
    border: '1px solid rgba(0, 255, 65, 0.3)'
  } as React.CSSProperties,

  displayNumber: {
    fontSize: '34px',
    fontFamily: "'Courier New', monospace",
    fontWeight: 900,
    color: '#00ff41',
    textShadow: '0 0 15px #00ff41, 0 0 30px rgba(0, 255, 65, 0.6)'
  } as React.CSSProperties,

  binaryProgress: {
    display: 'flex',
    gap: '3px',
    flexWrap: 'wrap' as const,
    justifyContent: 'center'
  } as React.CSSProperties,

  hackingText: {
    position: 'absolute' as const,
    bottom: '8px',
    fontSize: '10px',
    fontFamily: "'Courier New', monospace",
    fontWeight: 700,
    color: '#00ff41',
    zIndex: 3,
    letterSpacing: '2px'
  } as React.CSSProperties
};

// 16. Mechanical Gauge 样式 (机械仪表盘)
const styles_gauge = {
  container: {
    position: 'relative' as const,
    width: '140px',
    height: '140px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: '12px'
  } as React.CSSProperties,

  bezel: {
    position: 'relative' as const,
    width: '130px',
    height: '130px',
    background: 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #0a0a0a 100%)',
    borderRadius: '12px',
    padding: '28px 16px 48px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
    boxShadow: `
      0 10px 30px rgba(0, 0, 0, 0.8),
      inset 0 2px 4px rgba(255, 255, 255, 0.08),
      inset 0 -2px 4px rgba(0, 0, 0, 0.5)
    `,
    border: '3px solid #444'
  } as React.CSSProperties,

  displayWindow: {
    width: '70px',
    height: '32px',
    background: '#050505',
    borderRadius: '4px',
    border: '2px solid #333',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'inset 0 3px 8px rgba(0, 0, 0, 0.9)'
  } as React.CSSProperties,

  displayNumber: {
    fontSize: '22px',
    fontFamily: "'Courier New', monospace",
    fontWeight: 900,
    letterSpacing: '3px',
    lineHeight: 1
  } as React.CSSProperties,

  statusLabel: {
    fontSize: '10px',
    fontFamily: "'Arial Black', sans-serif",
    fontWeight: 900,
    letterSpacing: '2px',
    textShadow: '0 0 5px currentColor'
  } as React.CSSProperties,

  calibrating: {
    position: 'absolute' as const,
    top: '8px',
    right: '8px',
    fontSize: '18px',
    color: '#ffcc00',
    animation: 'gauge-calibrate 0.5s ease-in-out infinite'
  } as React.CSSProperties
};

// CSS 动画关键帧
const keyframesCSS = `
  @keyframes pulse-warning {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.05); }
  }

  @keyframes pulse-future {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 0.6; }
  }

  @keyframes blink {
    0%, 49% { opacity: 1; }
    50%, 99% { opacity: 0; }
  }

  @keyframes spin {
    from { transform: translate(-50%, -50%) rotate(0deg); }
    to { transform: translate(-50%, -50%) rotate(360deg); }
  }

  @keyframes ripple-expand {
    0% { width: 0; height: 0; opacity: 0.8; }
    100% { width: 150px; height: 150px; opacity: 0; }
  }

  @keyframes scan-down {
    0% { top: -3px; }
    100% { top: 103px; }
  }

  @keyframes glitch-skew {
    0% { transform: skewX(0deg); }
    20% { transform: skewX(-3deg); }
    40% { transform: skewX(2deg); }
    60% { transform: skewX(-1deg); }
    80% { transform: skewX(3deg); }
    100% { transform: skewX(0deg); }
  }

  @keyframes glitch-text {
    0% {
      text-shadow: 2px 0 #00ff00, -2px 0 #0088ff;
      transform: translate(0);
    }
    20% {
      text-shadow: -2px 0 #00ff00, 2px 0 #0088ff;
      transform: translate(-2px, 1px);
    }
    40% {
      text-shadow: 2px 0 #00ff00, -2px 0 #0088ff;
      transform: translate(2px, -1px);
    }
    60% {
      text-shadow: -2px 0 #00ff00, 2px 0 #0088ff;
      transform: translate(-1px, 2px);
    }
    80% {
      text-shadow: 2px 0 #00ff00, -2px 0 #0088ff;
      transform: translate(1px, -2px);
    }
    100% {
      text-shadow: 2px 0 #00ff00, -2px 0 #0088ff;
      transform: translate(0);
    }
  }

  @keyframes led-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  @keyframes bio-pulse {
    0%, 100% {
      transform: scale(1);
      opacity: 0.6;
    }
    50% {
      transform: scale(1.15);
      opacity: 1;
    }
  }

  @keyframes fluid-rotate {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  /* ====== 新增动画：Kinetic Typography (动态字体) ====== */
  @keyframes kinetic-bounce-in {
    0% {
      opacity: 0;
      transform: translateY(-30px) scale(0.3) rotate(-15deg);
    }
    50% {
      opacity: 1;
      transform: translateY(8px) scale(1.15) rotate(5deg);
    }
    70% {
      transform: translateY(-4px) scale(0.95) rotate(-2deg);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1) rotate(0deg);
    }
  }

  @keyframes kinetic-urgent-shake {
    0%, 100% { transform: translateX(0) rotate(0deg); }
    25% { transform: translateX(-3px) rotate(-2deg); }
    50% { transform: translateX(3px) rotate(2deg); }
    75% { transform: translateX(-2px) rotate(-1deg); }
  }

  @keyframes kinetic-blink-fast {
    0%, 49% { opacity: 1; }
    50%, 99% { opacity: 0; }
  }

  @keyframes kinetic-glow-rotate {
    0% { transform: rotate(0deg) scale(1); }
    50% { transform: rotate(180deg) scale(1.1); }
    100% { transform: rotate(360deg) scale(1); }
  }

  /* ====== 新增动画：Morphing Shape-Shifting (变形变换) ====== */
  @keyframes morphing-flow {
    0%, 100% {
      border-radius: 50%;
    }
    25% {
      border-radius: 45% 55% 52% 48% / 48% 45% 55% 52%;
    }
    50% {
      border-radius: 52% 48% 45% 55% / 55% 52% 48% 45%;
    }
    75% {
      border-radius: 48% 52% 55% 45% / 45% 48% 52% 55%;
    }
  }

  @keyframes morphing-float {
    0%, 100% {
      transform: translateY(0px);
    }
    50% {
      transform: translateY(-6px);
    }
  }

  @keyframes splash-drop {
    0% {
      transform: translate(-50%, -50%) scale(1);
      opacity: 1;
    }
    100% {
      transform: translate(calc(-50% + var(--drop-x, 20px)), calc(-50% + var(--drop-y, -30px))) scale(0);
      opacity: 0;
    }
  }

  @keyframes morphing-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* ====== 新增动画：Skeuomorphic Retro Power (拟物复古) ====== */
  @keyframes led-glow {
    0%, 100% {
      text-shadow:
        0 0 10px #ffb000,
        0 0 20px #ff8c00,
        0 0 30px #ff6600,
        inset 0 0 8px rgba(255, 176, 0, 0.5);
    }
    50% {
      text-shadow:
        0 0 15px #ffb000,
        0 0 30px #ff8c00,
        0 0 45px #ff6600,
        inset 0 0 12px rgba(255, 176, 0, 0.7);
    }
  }

  @keyframes led-flicker {
    0%, 100% { opacity: 1; }
    10% { opacity: 0.8; }
    20% { opacity: 1; }
    30% { opacity: 0.6; }
    40% { opacity: 1; }
    50% { opacity: 0.9; }
    60% { opacity: 1; }
    70% { opacity: 0.7; }
    80% { opacity: 1; }
    90% { opacity: 0.85; }
  }

  @keyframes power-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  @keyframes led-pulse-green {
    0%, 100% {
      box-shadow:
        0 0 15px #00ff88,
        0 0 30px rgba(0, 255, 136, 0.5),
        inset 0 0 8px rgba(255, 255, 255, 0.4);
    }
    50% {
      box-shadow:
        0 0 25px #00ff88,
        0 0 50px rgba(0, 255, 136, 0.7),
        inset 0 0 12px rgba(255, 255, 255, 0.6);
    }
  }

  @keyframes led-pulse-red {
    0%, 100% {
      box-shadow: 0 0 8px #ff3333, inset 0 0 4px rgba(255, 255, 255, 0.3);
    }
    50% {
      box-shadow: 0 0 12px #ff3333, inset 0 0 6px rgba(255, 255, 255, 0.4);
    }
  }

  /* ====== 新增动画：Chaos Packaging (混乱包装) ====== */
  @keyframes chaos-glitch-0 {
    0%, 100% { transform: translate(0, 0) skew(0deg); opacity: 1; }
    20% { transform: translate(-3px, 2px) skew(-5deg); opacity: 0.8; }
    40% { transform: translate(3px, -1px) skew(3deg); opacity: 1; }
    60% { transform: translate(-2px, -2px) skew(-2deg); opacity: 0.9; }
    80% { transform: translate(2px, 1px) skew(4deg); opacity: 1; }
  }

  @keyframes chaos-glitch-1 {
    0%, 100% { transform: translate(0, 0) skew(0deg); opacity: 1; }
    15% { transform: translate(4px, -2px) skew(6deg); opacity: 0.7; }
    35% { transform: translate(-3px, 3px) skew(-4deg); opacity: 1; }
    55% { transform: translate(2px, 2px) skew(3deg); opacity: 0.85; }
    75% { transform: translate(-4px, -1px) skew(-5deg); opacity: 1; }
  }

  @keyframes chaos-glitch-2 {
    0%, 100% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
    25% { transform: translate(-2px, 3px) rotate(-8deg); opacity: 0.9; }
    50% { transform: translate(3px, -3px) rotate(6deg); opacity: 1; }
    75% { transform: translate(-3px, 2px) rotate(-4deg); opacity: 0.8; }
  }

  @keyframes chaos-drift {
    0%, 100% { transform: translateY(0px) translateX(0px); }
    25% { transform: translateY(-3px) translateX(2px); }
    50% { transform: translateY(2px) translateX(-2px); }
    75% { transform: translateY(-2px) translateX(1px); }
  }

  @keyframes chaos-flash {
    0% { opacity: 0.9; transform: scaleX(1); }
    50% { opacity: 1; transform: scaleX(1.5); }
    100% { opacity: 0; transform: scaleX(0.1); }
  }

  @keyframes chaos-collide {
    0%, 100% {
      transform: translate(0, 0) scale(1);
      opacity: 0.6;
    }
    25% {
      transform: translate(5px, -4px) scale(1.2);
      opacity: 0.9;
    }
    50% {
      transform: translate(-3px, 3px) scale(0.8);
      opacity: 0.5;
    }
    75% {
      transform: translate(4px, 2px) scale(1.1);
      opacity: 0.8;
    }
  }

  @keyframes chaos-explode {
    0%, 100% {
      transform: translate(0, 0) scale(1) rotate(0deg);
      opacity: 1;
    }
    25% {
      transform: translate(calc(var(--explode-x, 5px) * -1), calc(var(--explode-y, -8px))) scale(1.3) rotate(-15deg);
      opacity: 0.8;
    }
    50% {
      transform: translate(var(--explode-x, 5px), var(--explode-y, -8px)) scale(0.9) rotate(10deg);
      opacity: 1;
    }
    75% {
      transform: translate(calc(var(--explode-x, 5px) * -0.5), calc(var(--explode-y, -8px) * 0.5)) scale(1.15) rotate(-5deg);
      opacity: 0.9;
    }
  }

  @keyframes chaos-color-shift {
    0%, 100% { filter: hue-rotate(0deg) brightness(1); }
    33% { filter: hue-rotate(90deg) brightness(1.2); }
    66% { filter: hue-rotate(180deg) brightness(0.9); }
  }

  /* ====== 新增动画：Flip Clock Classic (翻牌时钟) ====== */
  @keyframes flip-spin {
    from { transform: rotateY(0deg); }
    to { transform: rotateY(360deg); }
  }

  /* ====== 新增动画：Particle Explosion (粒子爆炸) ====== */
  @keyframes particle-pulse {
    0%, 100% {
      transform: translate(-50%, -50%) scale(1);
      opacity: 0.8;
    }
    50% {
      transform: translate(-50%, -50%) scale(1.3);
      opacity: 1;
    }
  }

  @keyframes explode-out {
    0% {
      transform: translate(-50%, -50%) scale(1);
      opacity: 1;
    }
    100% {
      transform: translate(
        calc(-50% + var(--explode-x, 20px)),
        calc(-50% + var(--explode-y, -25px))
      ) scale(0);
      opacity: 0;
    }
  }

  /* ====== 新增动画：Geometric Orbital (几何轨道) ====== */
  @keyframes orbital-spin-1 {
    from { transform: translate(-50%, -50%) rotate(0deg); }
    to { transform: translate(-50%, -50%) rotate(360deg); }
  }

  @keyframes orbital-spin-2 {
    from { transform: translate(-50%, -50%) rotate(0deg); }
    to { transform: translate(-50%, -50%) rotate(-360deg); }
  }

  @keyframes orbital-spin-3 {
    from { transform: translate(-50%, -50%) rotate(0deg); }
    to { transform: translate(-50%, -50%) rotate(360deg); }
  }

  @keyframes orbit-1 {
    from {
      transform: translate(-50%, calc(-52.5px)) rotate(0deg) translate(52.5px) rotate(0deg);
    }
    to {
      transform: translate(-50%, calc(-52.5px)) rotate(360deg) translate(52.5px) rotate(-360deg);
    }
  }

  @keyframes orbit-2 {
    from {
      transform: translate(-50%, calc(-42.5px)) rotate(0deg) translate(42.5px) rotate(0deg);
    }
    to {
      transform: translate(-50%, calc(-42.5px)) rotate(-360deg) translate(42.5px) rotate(360deg);
    }
  }

  @keyframes orbit-3 {
    from {
      transform: translate(-50%, calc(-32.5px)) rotate(0deg) translate(32.5px) rotate(0deg);
    }
    to {
      transform: translate(-50%, calc(-32.5px)) rotate(360deg) translate(32.5px) rotate(-360deg);
    }
  }

  @keyframes warp-pulse {
    0%, 100% {
      transform: translate(-50%, -50%) scale(1);
      opacity: 0.8;
    }
    50% {
      transform: translate(-50%, -50%) scale(1.15);
      opacity: 1;
    }
  }

  /* ====== 新增动画：Pulse Wave Ripple (脉冲波纹) ====== */
  @keyframes ripple-expand-1 {
    0% {
      width: 60px;
      height: 60px;
      opacity: 0.6;
      transform: translate(-50%, -50%) scale(0.8);
    }
    100% {
      width: 120px;
      height: 120px;
      opacity: 0;
      transform: translate(-50%, -50%) scale(1.2);
    }
  }

  @keyframes ripple-expand-2 {
    0% {
      width: 80px;
      height: 80px;
      opacity: 0.45;
      transform: translate(-50%, -50%) scale(0.8);
    }
    100% {
      width: 140px;
      height: 140px;
      opacity: 0;
      transform: translate(-50%, -50%) scale(1.2);
    }
  }

  @keyframes ripple-expand-3 {
    0% {
      width: 100px;
      height: 100px;
      opacity: 0.3;
      transform: translate(-50%, -50%) scale(0.8);
    }
    100% {
      width: 160px;
      height: 160px;
      opacity: 0;
      transform: translate(-50%, -50%) scale(1.2);
    }
  }

  @keyframes pulse-core {
    0%, 100% {
      transform: scale(1);
      box-shadow: 0 0 30px currentColor;
    }
    50% {
      transform: scale(1.08);
      box-shadow: 0 0 45px currentColor, 0 0 60px currentColor;
    }
  }

  @keyframes pulse-core-urgent {
    0%, 100% {
      transform: scale(1);
      box-shadow: 0 0 30px currentColor;
    }
    25% {
      transform: scale(1.12);
      box-shadow: 0 0 50px currentColor, 0 0 70px currentColor;
    }
    50% {
      transform: scale(1);
      box-shadow: 0 0 35px currentColor;
    }
    75% {
      transform: scale(1.12);
      box-shadow: 0 0 55px currentColor, 0 0 75px currentColor;
    }
  }

  @keyframes shockwave-burst {
    0% {
      transform: translate(-50%, -50%) scale(0.8);
      opacity: 1;
    }
    100% {
      transform: translate(-50%, -50%) scale(1.4);
      opacity: 0;
    }
  }

  /* ====== 新增动画：Digital Matrix Rain (数字矩阵雨) ====== */
  @keyframes matrix-fall {
    0% {
      transform: translateY(-100%);
      opacity: 0;
    }
    10% {
      opacity: 1;
    }
    90% {
      opacity: 0.7;
    }
    100% {
      transform: translateY(800%);
      opacity: 0;
    }
  }

  @keyframes matrix-glitch {
    0%, 100% {
      text-shadow: 0 0 10px #00ff41;
      transform: translateX(0);
    }
    20% {
      text-shadow: -2px 0 #00ff41, 2px 0 #00cc33;
      transform: translateX(-2px);
    }
    40% {
      text-shadow: 2px 0 #00ff41, -2px 0 #00aa22;
      transform: translateX(2px);
    }
    60% {
      text-shadow: -1px 0 #00ff41, 1px 0 #008811;
      transform: translateX(-1px);
    }
    80% {
      text-shadow: 1px 0 #00ff41, -1px 0 #006600;
      transform: translateX(1px);
    }
  }

  /* ====== 新增动画：Mechanical Gauge (机械仪表盘) ====== */
  @keyframes gauge-calibrate {
    0%, 100% {
      transform: rotate(0deg);
    }
    25% {
      transform: rotate(15deg);
    }
    50% {
      transform: rotate(0deg);
    }
    75% {
      transform: rotate(-15deg);
    }
  }

  /* 响应式布局 */
  @media (max-width: 1200px) {
    .showcase-grid {
      grid-template-columns: repeat(2, 1fr) !important;
    }
  }

  @media (max-width: 768px) {
    .showcase-grid {
      grid-template-columns: 1fr !important;
    }
  }
`;

export default RefreshButtonShowcase;
