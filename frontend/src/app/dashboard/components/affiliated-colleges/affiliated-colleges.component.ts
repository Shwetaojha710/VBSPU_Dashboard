import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AffiliatedCollegesData } from '../../dashboard.models';

/** District outlines traced from the Figma frame, in panel coordinates. */
const DISTRICT_SHAPES = [
  {
    fill: 'var(--color-district-1)',
    label: { x: 159, nameY: 145, countY: 171 },
    points:
      '162,84 151,88 142,92 140,96 138,100 131,104 128,108 125,112 116,116 114,120 111,124 104,128 102,132 99,136 98,140 98,144 99,148 95,152 91,156 90,160 89,164 91,168 95,172 97,176 99,180 106,184 112,188 112,192 118,196 123,200 126,204 143,208 147,210 191,206 198,202 204,198 204,194 205,190 207,186 210,182 212,178 211,174 211,170 212,166 214,162 216,158 217,154 217,150 219,146 222,142 224,138 223,134 222,130 224,126 226,122 226,118 224,114 218,110 211,106 190,102 187,98 185,94 166,90 163,86'
  },
  {
    fill: 'var(--color-district-2)',
    label: { x: 267, nameY: 154, countY: 179 },
    points:
      '293,106 274,110 262,114 245,118 227,122 225,126 224,130 224,134 225,138 223,142 220,146 218,150 218,154 218,158 216,162 213,166 212,170 213,174 213,178 211,182 208,186 209,190 214,194 218,198 226,202 231,206 234,210 254,214 277,212 279,208 290,204 293,200 294,196 302,192 305,188 307,184 314,180 323,176 327,172 328,168 328,164 327,160 327,156 329,152 331,148 325,144 324,140 322,136 312,132 311,128 304,124 300,120 301,116 301,112 297,108'
  }
];

@Component({
  selector: 'app-affiliated-colleges',
  templateUrl: './affiliated-colleges.component.html',
  styleUrl: './affiliated-colleges.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AffiliatedCollegesComponent {
  readonly data = input.required<AffiliatedCollegesData>();

  /** Second district is painted first so the first one overlaps it, as in the design. */
  protected readonly shapes = DISTRICT_SHAPES;
  protected readonly paintOrder = [1, 0];
}
