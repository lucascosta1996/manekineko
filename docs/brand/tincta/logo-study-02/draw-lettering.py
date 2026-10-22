"""Outline licensed type studies. Custom t and i geometry belongs only to A.

Requires fonttools. Outlined outputs are committed so normal study rendering
does not require Python, installed fonts, or network access.
"""
from pathlib import Path
import json
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

HERE = Path(__file__).resolve().parent
def lettering(file, text, weight, tracking, tweaks, custom=False):
    font = instantiateVariableFont(TTFont(HERE/'type-sources'/file), {'wght': weight})
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    unit = font['head'].unitsPerEm
    x, paths = 0, []
    for index, char in enumerate(text):
        x += tweaks[index] if index < len(tweaks) else 0
        glyph = glyphs[cmap[ord(char)]]
        pen = SVGPathPen(glyphs)
        glyph.draw(TransformPen(pen, (1000/unit,0,0,-1000/unit,x,760)))
        path = pen.getCommands()
        advance = glyph.width*1000/unit
        if custom and char == 't':
            # Upright, flat-ended t; compact shoulder and squared release.
            path = f'M{x+105} 55H{x+207}V220H{x+378}V314H{x+207}V561Q{x+207} 666 {x+307} 666H{x+378}V760H{x+298}Q{x+105} 760 {x+105} 573V314H{x+20}V220H{x+105}Z'
            advance = 415
        elif custom and char == 'i':
            path = f'M{x+60} 220H{x+162}V760H{x+60}ZM{x+60} 55H{x+162}V157H{x+60}Z'
            advance = 236
        paths.append(path)
        x += advance + tracking
    return {'viewBox':f'0 0 {round(x-tracking,3)} 780','width':round(x-tracking,3),'height':780,'paths':paths,
            'source':file,'weight':weight,'text':text,'custom':custom,'tracking':tracking,'pairAdjustments':tweaks}

data = {
 'a':lettering('Manrope.ttf','tincta',560,-20,[0,-7,0,-8,-12,-4],True),
 'b':lettering('InstrumentSans.ttf','Tincta',560,-23,[0,-20,-4,-2,-16,-2]),
 'c':lettering('InstrumentSans.ttf','TINCTA',500,54,[0,-20,-5,0,-22,-48]),
}
(HERE/'lettering.json').write_text(json.dumps(data,indent=2)+'\n')
print('Outlined three lettering studies with source and adjustment records.')
