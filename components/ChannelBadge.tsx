
import React from 'react';
import { BadgeStyle, TextStyle } from '../types';

interface ChannelBadgeProps {
  name: string;
  label?: string; // Optional override
  badgeStyle?: BadgeStyle;
  color?: string; // Brand/Background Color
  textColor?: string;
  textStyle?: TextStyle;
  className?: string;
  title?: string;
}

const getAbbreviation = (name: string): string => {
    if (!name) return '';
    const cleanName = name.trim();

    // 1. Check for Kebab-Case or Snake_Case
    if (cleanName.includes('-') || cleanName.includes('_')) {
        const parts = cleanName.split(/[-_]/).filter(p => p.length > 0);
        if (parts.length > 1) {
            return parts.map(p => p.charAt(0)).join('').substring(0, 3).toUpperCase();
        }
    }

    // 2. Check for CamelCase or PascalCase (split by transition from lower to Upper or start of Upper)
    // "camelCase" -> "camel Case" -> C, C
    // "PascalCase" -> "Pascal Case" -> P, C
    // "simple" -> "simple" -> S (handled by fallback)
    const splitByCase = cleanName.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    const caseParts = splitByCase.split(' ').filter(p => p.length > 0);
    
    if (caseParts.length > 1) {
        return caseParts.map(p => p.charAt(0)).join('').substring(0, 3).toUpperCase();
    }

    // 3. Fallback: First 2 letters
    return cleanName.substring(0, 2).toUpperCase();
};

const ChannelBadge: React.FC<ChannelBadgeProps> = ({
  name,
  label,
  badgeStyle = 'filled',
  color = '#6366f1',
  textColor = '#ffffff',
  textStyle = 'none',
  className = '',
  title
}) => {
  let badgeClass = '';
  let badgeCss: React.CSSProperties = {};

  const displayText = label || getAbbreviation(name);

  switch (badgeStyle) {
    case 'filled':
        badgeClass = 'rounded font-black text-white shadow-sm opacity-90 border border-transparent';
        badgeCss = { backgroundColor: color, color: textColor };
        break;
    case 'outlined':
        badgeClass = 'rounded font-black border-2 bg-transparent';
        badgeCss = { borderColor: color, color: textColor === '#ffffff' ? color : textColor };
        break;
    case 'neon':
        badgeClass = 'rounded font-black border bg-transparent';
        badgeCss = { 
            borderColor: color, 
            color: color, 
            boxShadow: `0 0 5px ${color}, inset 0 0 5px ${color}20`,
            textShadow: `0 0 5px ${color}`
        };
        break;
    case 'glass':
        badgeClass = 'rounded font-black backdrop-blur-md border border-white/10 shadow-sm';
        badgeCss = { backgroundColor: `${color}40`, color: textColor };
        break;
    case 'cyber':
        badgeClass = 'rounded-r-md border-l-4 font-black bg-slate-800/80';
        badgeCss = { borderLeftColor: color, color: textColor };
        break;
    default:
        badgeClass = 'rounded font-black text-white shadow-sm opacity-80';
        badgeCss = { backgroundColor: color };
  }

  // Text Styles
  if (textStyle === 'shadow') {
      badgeCss.textShadow = '1px 1px 0 rgba(0,0,0,0.8)';
  } else if (textStyle === 'glow') {
      const glowColor = textColor === '#ffffff' ? color : textColor;
      // Combine with existing textShadow if neon
      const currentShadow = badgeCss.textShadow ? `${badgeCss.textShadow}, ` : '';
      badgeCss.textShadow = `${currentShadow}0 0 5px ${glowColor}, 0 0 10px ${glowColor}`;
  } else if (textStyle === 'outline') {
      (badgeCss as any).WebkitTextStroke = '0.5px rgba(255,255,255,0.5)';
  } else if (textStyle === 'retro') {
      badgeCss.fontFamily = '"Courier New", Courier, monospace';
      badgeCss.textShadow = '2px 2px 0 #000';
      badgeCss.letterSpacing = '0.05em';
  }

  return (
    <span 
      className={`px-1.5 h-4 inline-flex items-center justify-center text-[10px] uppercase tracking-wider whitespace-nowrap ${badgeClass} ${className}`}
      style={badgeCss}
      title={title || name}
    >
      {displayText}
    </span>
  );
};

export default ChannelBadge;
