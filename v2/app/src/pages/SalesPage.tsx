import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import './sales.css';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SalesRow {
  name: string;
  total: number | null;
  presales: number | null;
  sales: number;
  p_sp: number | null;
  p_pt: number | null;
  p_st: number | null;
  bonus: number;
}

interface MonthData {
  rows: SalesRow[];
  dateFrom: string | null;
  dateTo: string | null;
}

interface SalesApiResponse {
  ok: boolean;
  data: Record<string, MonthData>;
}

type Month = 'jan' | 'feb' | 'mar' | 'apr' | 'may' | 'jun' | 'jul' | 'aug' | 'sep' | 'oct' | 'nov' | 'dec';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_MONTHS: Month[] = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

const PERIOD_LABELS: Record<Month, string> = {
  jan: 'Январь', feb: 'Февраль', mar: 'Март', apr: 'Апрель',
  may: 'Май', jun: 'Июнь', jul: 'Июль', aug: 'Август',
  sep: 'Сентябрь', oct: 'Октябрь', nov: 'Ноябрь', dec: 'Декабрь',
};

const MONTH_NAMES: Record<Month, string> = {
  jan: 'Январь', feb: 'Февраль', mar: 'Март', apr: 'Апрель',
  may: 'Май', jun: 'Июнь', jul: 'Июль', aug: 'Август',
  sep: 'Сентябрь', oct: 'Октябрь', nov: 'Ноябрь', dec: 'Декабрь',
};

const TOP_ICONS = ['🥇', '🥈', '🥉'];
const EXCLUDE_NAMES = ['oliver', 'ai'];
const COL_KEYS = ['rank', 'name', 'total', 'presales', 'sales', 'p_sp', 'p_pt', 'p_st', 'bonus'] as const;
type ColKey = typeof COL_KEYS[number];

// ─── Embedded fallback data ───────────────────────────────────────────────────

const EMBEDDED_DATA: Record<Month, SalesRow[]> = {
  jan: [
    { name: 'Denzel',   total: 513,  presales: 170, sales: 8, p_sp: 4.71, p_pt: 33.14, p_st: 1.56, bonus: 35.20  },
    { name: 'Tom',      total: 477,  presales: 90,  sales: 4, p_sp: 4.44, p_pt: 18.87, p_st: 0.84, bonus: 10.00  },
    { name: 'Holly',    total: 485,  presales: 118, sales: 3, p_sp: 2.54, p_pt: 24.33, p_st: 0.62, bonus: 8.25   },
    { name: 'Christine',total: 583,  presales: 100, sales: 3, p_sp: 3.00, p_pt: 17.15, p_st: 0.51, bonus: 6.75   },
    { name: 'Casper',   total: 1165, presales: 107, sales: 5, p_sp: 4.67, p_pt: 9.18,  p_st: 0.43, bonus: 6.375  },
    { name: 'Plover',   total: 360,  presales: 74,  sales: 2, p_sp: 2.70, p_pt: 20.56, p_st: 0.56, bonus: 5.00   },
    { name: 'Felicia',  total: 862,  presales: 134, sales: 2, p_sp: 1.49, p_pt: 15.55, p_st: 0.23, bonus: 4.50   },
    { name: 'Chadwick', total: 686,  presales: 35,  sales: 2, p_sp: 5.71, p_pt: 5.10,  p_st: 0.29, bonus: 2.55   },
    { name: 'Scott',    total: 604,  presales: 53,  sales: 2, p_sp: 3.77, p_pt: 8.77,  p_st: 0.33, bonus: 2.55   },
    { name: 'Ewan',     total: 745,  presales: 111, sales: 1, p_sp: 0.90, p_pt: 14.90, p_st: 0.13, bonus: 2.25   },
    { name: 'River',    total: 613,  presales: 107, sales: 1, p_sp: 0.93, p_pt: 17.46, p_st: 0.16, bonus: 2.25   },
    { name: 'Melvin',   total: 435,  presales: 38,  sales: 1, p_sp: 2.63, p_pt: 8.74,  p_st: 0.23, bonus: 1.275  },
    { name: 'Alexia',   total: 665,  presales: 17,  sales: 1, p_sp: 5.88, p_pt: 2.56,  p_st: 0.15, bonus: 0      },
    { name: 'Ashton',   total: 677,  presales: 31,  sales: 1, p_sp: 3.23, p_pt: 4.58,  p_st: 0.15, bonus: 0      },
    { name: 'Bill',     total: 679,  presales: 16,  sales: 2, p_sp: 12.50,p_pt: 2.36,  p_st: 0.29, bonus: 0      },
    { name: 'Bridget',  total: 1120, presales: 26,  sales: 1, p_sp: 3.85, p_pt: 2.32,  p_st: 0.09, bonus: 0      },
    { name: 'Chandler', total: 968,  presales: 11,  sales: 1, p_sp: 9.09, p_pt: 1.14,  p_st: 0.10, bonus: 0      },
    { name: 'Jay',      total: 1209, presales: 9,   sales: 1, p_sp: 11.11,p_pt: 0.74,  p_st: 0.08, bonus: 0      },
    { name: 'Monica',   total: 1028, presales: 7,   sales: 1, p_sp: 14.29,p_pt: 0.68,  p_st: 0.10, bonus: 0      },
    { name: 'Simon',    total: 448,  presales: 2,   sales: 1, p_sp: 50.00,p_pt: 0.45,  p_st: 0.22, bonus: 0      },
    { name: 'Will',     total: 1229, presales: 27,  sales: 1, p_sp: 3.70, p_pt: 2.20,  p_st: 0.08, bonus: 0      },
  ],
  feb: [
    { name: 'Denzel',   total: 663,  presales: 227, sales: 10, p_sp: 4.41,  p_pt: 34.24, p_st: 1.51, bonus: 44     },
    { name: 'Holly',    total: 628,  presales: 156, sales: 5,  p_sp: 3.21,  p_pt: 24.84, p_st: 0.80, bonus: 13.75  },
    { name: 'Plover',   total: 535,  presales: 101, sales: 5,  p_sp: 4.95,  p_pt: 18.88, p_st: 0.93, bonus: 12.5   },
    { name: 'Tom',      total: 477,  presales: 90,  sales: 4,  p_sp: 4.44,  p_pt: 18.87, p_st: 0.84, bonus: 10     },
    { name: 'Casper',   total: 1486, presales: 132, sales: 6,  p_sp: 4.55,  p_pt: 8.88,  p_st: 0.40, bonus: 7.65   },
    { name: 'Christine',total: 762,  presales: 135, sales: 3,  p_sp: 2.22,  p_pt: 17.72, p_st: 0.39, bonus: 6.75   },
    { name: 'Felicia',  total: 1066, presales: 163, sales: 2,  p_sp: 1.23,  p_pt: 15.29, p_st: 0.19, bonus: 4.5    },
    { name: 'Warren',   total: 1284, presales: 79,  sales: 3,  p_sp: 3.80,  p_pt: 6.15,  p_st: 0.23, bonus: 3.825  },
    { name: 'Scott',    total: 604,  presales: 53,  sales: 2,  p_sp: 3.77,  p_pt: 8.77,  p_st: 0.33, bonus: 2.55   },
    { name: 'Ewan',     total: 976,  presales: 125, sales: 1,  p_sp: 0.80,  p_pt: 12.81, p_st: 0.10, bonus: 2.25   },
    { name: 'River',    total: 898,  presales: 115, sales: 1,  p_sp: 0.87,  p_pt: 12.81, p_st: 0.11, bonus: 2.25   },
    { name: 'Ashton',   total: 853,  presales: 43,  sales: 1,  p_sp: 2.33,  p_pt: 5.04,  p_st: 0.12, bonus: 1.275  },
    { name: 'Melvin',   total: 435,  presales: 38,  sales: 1,  p_sp: 2.63,  p_pt: 8.74,  p_st: 0.23, bonus: 1.275  },
    { name: 'Alexia',   total: 762,  presales: 17,  sales: 1,  p_sp: 5.88,  p_pt: 2.23,  p_st: 0.13, bonus: 0      },
    { name: 'Balfour',  total: 1356, presales: 42,  sales: 2,  p_sp: 4.76,  p_pt: 3.10,  p_st: 0.15, bonus: 0      },
    { name: 'Bill',     total: 851,  presales: 24,  sales: 2,  p_sp: 8.33,  p_pt: 2.82,  p_st: 0.24, bonus: 0      },
    { name: 'Bridget',  total: 1313, presales: 34,  sales: 1,  p_sp: 2.94,  p_pt: 2.59,  p_st: 0.08, bonus: 0      },
    { name: 'Chadwick', total: 1020, presales: 35,  sales: 2,  p_sp: 5.71,  p_pt: 3.43,  p_st: 0.20, bonus: 0      },
    { name: 'Chandler', total: 1071, presales: 18,  sales: 2,  p_sp: 11.11, p_pt: 1.68,  p_st: 0.19, bonus: 0      },
    { name: 'Fletcher', total: 1173, presales: 5,   sales: 2,  p_sp: 40.00, p_pt: 0.43,  p_st: 0.17, bonus: 0      },
  ],
  mar: [
    { name: 'Scott',       total: 975,  presales: 154, sales: 23, p_sp: 14.94, p_pt: 15.79, p_st: 2.36, bonus: 82.8   },
    { name: 'Tom',         total: 512,  presales: 140, sales: 13, p_sp: 9.29,  p_pt: 27.34, p_st: 2.54, bonus: 71.5   },
    { name: 'Holly',       total: 848,  presales: 294, sales: 14, p_sp: 4.76,  p_pt: 34.67, p_st: 1.65, bonus: 61.6   },
    { name: 'Felicia',     total: 1283, presales: 165, sales: 9,  p_sp: 5.45,  p_pt: 12.86, p_st: 0.70, bonus: 20.25  },
    { name: 'Casper',      total: 823,  presales: 150, sales: 7,  p_sp: 4.67,  p_pt: 18.23, p_st: 0.85, bonus: 17.5   },
    { name: 'Denzel',      total: 639,  presales: 162, sales: 6,  p_sp: 3.70,  p_pt: 25.35, p_st: 0.94, bonus: 16.5   },
    { name: 'Will',        total: 1584, presales: 156, sales: 12, p_sp: 7.69,  p_pt: 9.85,  p_st: 0.76, bonus: 15.3   },
    { name: 'Christine',   total: 675,  presales: 158, sales: 5,  p_sp: 3.16,  p_pt: 23.41, p_st: 0.74, bonus: 12.5   },
    { name: 'Plover',      total: 629,  presales: 115, sales: 5,  p_sp: 4.35,  p_pt: 18.28, p_st: 0.79, bonus: 12.5   },
    { name: 'Bridget',     total: 1212, presales: 73,  sales: 9,  p_sp: 12.33, p_pt: 6.02,  p_st: 0.74, bonus: 11.475 },
    { name: 'Ashton',      total: 1118, presales: 59,  sales: 7,  p_sp: 11.86, p_pt: 5.28,  p_st: 0.63, bonus: 8.925  },
    { name: 'Nolan',       total: 1075, presales: 57,  sales: 3,  p_sp: 5.26,  p_pt: 5.30,  p_st: 0.28, bonus: 3.825  },
    { name: 'Warren',      total: 1093, presales: 75,  sales: 3,  p_sp: 4.00,  p_pt: 6.86,  p_st: 0.27, bonus: 3.825  },
    { name: 'Balfour',     total: 1161, presales: 49,  sales: 2,  p_sp: 4.08,  p_pt: 4.22,  p_st: 0.17, bonus: 0      },
    { name: 'Bob',         total: 1481, presales: 14,  sales: 2,  p_sp: 14.29, p_pt: 0.95,  p_st: 0.14, bonus: 0      },
    { name: 'Calvin',      total: 851,  presales: 16,  sales: 3,  p_sp: 18.75, p_pt: 1.88,  p_st: 0.35, bonus: 0      },
    { name: 'Colin',       total: 1775, presales: 60,  sales: 8,  p_sp: 13.33, p_pt: 3.38,  p_st: 0.45, bonus: 0      },
  ],
  apr: [
    { name: 'Will',      total: 1162, presales: 212, sales: 30, p_sp: 14.15, p_pt: 18.24, p_st: 2.58, bonus: 150.0  },
    { name: 'Earl',      total: 1552, presales: 195, sales: 32, p_sp: 16.41, p_pt: 12.56, p_st: 2.06, bonus: 115.2  },
    { name: 'Christine', total: 640,  presales: 231, sales: 19, p_sp: 8.23,  p_pt: 36.09, p_st: 2.97, bonus: 104.5  },
    { name: 'Tom',       total: 991,  presales: 267, sales: 20, p_sp: 7.49,  p_pt: 26.94, p_st: 2.02, bonus: 88.0   },
    { name: 'Mike',      total: 1545, presales: 192, sales: 22, p_sp: 11.46, p_pt: 12.43, p_st: 1.42, bonus: 79.2   },
    { name: 'Bridget',   total: 1116, presales: 233, sales: 17, p_sp: 7.30,  p_pt: 20.88, p_st: 1.52, bonus: 68.0   },
    { name: 'Balfour',   total: 1296, presales: 224, sales: 17, p_sp: 7.59,  p_pt: 17.28, p_st: 1.31, bonus: 61.2   },
    { name: 'Casper',    total: 1080, presales: 202, sales: 15, p_sp: 7.43,  p_pt: 18.70, p_st: 1.39, bonus: 60.0   },
    { name: 'Robert',    total: 1492, presales: 173, sales: 15, p_sp: 8.67,  p_pt: 11.60, p_st: 1.01, bonus: 54.0   },
    { name: 'Scott',     total: 1301, presales: 141, sales: 15, p_sp: 10.64, p_pt: 10.84, p_st: 1.15, bonus: 54.0   },
    { name: 'River',     total: 1010, presales: 153, sales: 13, p_sp: 8.50,  p_pt: 15.15, p_st: 1.29, bonus: 46.8   },
    { name: 'Felicia',   total: 976,  presales: 218, sales: 10, p_sp: 4.59,  p_pt: 22.34, p_st: 1.02, bonus: 40.0   },
    { name: 'Plover',    total: 784,  presales: 163, sales: 10, p_sp: 6.13,  p_pt: 20.79, p_st: 1.28, bonus: 40.0   },
    { name: 'Jonathan',  total: 1354, presales: 89,  sales: 18, p_sp: 20.22, p_pt: 6.57,  p_st: 1.33, bonus: 36.72  },
    { name: 'Bowen',     total: 967,  presales: 98,  sales: 10, p_sp: 10.20, p_pt: 10.13, p_st: 1.03, bonus: 36.0   },
    { name: 'Denzel',    total: 682,  presales: 136, sales: 8,  p_sp: 5.88,  p_pt: 19.94, p_st: 1.17, bonus: 32.0   },
    { name: 'Holly',     total: 352,  presales: 114, sales: 7,  p_sp: 6.14,  p_pt: 32.39, p_st: 1.99, bonus: 30.8   },
    { name: 'Lex',       total: 1372, presales: 78,  sales: 15, p_sp: 19.23, p_pt: 5.69,  p_st: 1.09, bonus: 30.6   },
    { name: 'Robin',     total: 1149, presales: 84,  sales: 14, p_sp: 16.67, p_pt: 7.31,  p_st: 1.22, bonus: 28.56  },
    { name: 'Gross',     total: 1175, presales: 102, sales: 12, p_sp: 11.76, p_pt: 8.68,  p_st: 1.02, bonus: 24.48  },
    { name: 'Kenzo',     total: 2128, presales: 155, sales: 17, p_sp: 10.97, p_pt: 7.28,  p_st: 0.80, bonus: 21.675 },
    { name: 'Warren',    total: 441,  presales: 103, sales: 5,  p_sp: 4.85,  p_pt: 23.36, p_st: 1.13, bonus: 20.0   },
    { name: 'Hardy',     total: 1580, presales: 124, sales: 15, p_sp: 12.10, p_pt: 7.85,  p_st: 0.95, bonus: 19.125 },
    { name: 'Nolan',     total: 983,  presales: 131, sales: 8,  p_sp: 6.11,  p_pt: 13.33, p_st: 0.81, bonus: 18.0   },
    { name: 'Meadow',    total: 1007, presales: 55,  sales: 7,  p_sp: 12.73, p_pt: 5.46,  p_st: 0.70, bonus: 8.925  },
    { name: 'Norman',    total: 691,  presales: 79,  sales: 3,  p_sp: 3.80,  p_pt: 11.43, p_st: 0.43, bonus: 6.75   },
    { name: 'Alexia',    total: 827,  presales: 50,  sales: 2,  p_sp: 4.00,  p_pt: 6.05,  p_st: 0.24, bonus: 2.55   },
  ],
  may: [
    { name: 'Lex',       total: 1729, presales: 804, sales: 90, p_sp: 11.19, p_pt: 46.5009, p_st: 5.2053, bonus: 643.5  },
    { name: 'Ashton',    total: 2249, presales: 811, sales: 88, p_sp: 10.85, p_pt: 36.0605, p_st: 3.9129, bonus: 580.8  },
    { name: 'Scott',     total: 1177, presales: 404, sales: 62, p_sp: 15.35, p_pt: 34.3246, p_st: 5.2676, bonus: 443.3  },
    { name: 'Earl',      total: 1993, presales: 828, sales: 69, p_sp: 8.33,  p_pt: 41.5454, p_st: 3.4621, bonus: 417.45 },
    { name: 'Jonathan',  total: 1654, presales: 361, sales: 48, p_sp: 13.30, p_pt: 21.8259, p_st: 2.9021, bonus: 240.0  },
    { name: 'Rudy',      total: 2724, presales: 849, sales: 60, p_sp: 7.07,  p_pt: 31.1674, p_st: 2.2026, bonus: 264.0  },
    { name: 'Kenzo',     total: 2481, presales: 734, sales: 53, p_sp: 7.22,  p_pt: 29.5848, p_st: 2.1362, bonus: 233.2  },
    { name: 'Tom',       total: 1541, presales: 386, sales: 39, p_sp: 10.10, p_pt: 25.0487, p_st: 2.5308, bonus: 214.5  },
    { name: 'Robert',    total: 2192, presales: 645, sales: 52, p_sp: 8.06,  p_pt: 29.4252, p_st: 2.3723, bonus: 228.8  },
    { name: 'Balfour',   total: 1663, presales: 726, sales: 40, p_sp: 5.51,  p_pt: 43.6560, p_st: 2.4053, bonus: 176.0  },
    { name: 'Christine', total: 1076, presales: 606, sales: 30, p_sp: 4.95,  p_pt: 56.3197, p_st: 2.7881, bonus: 165.0  },
    { name: 'Will',      total: 1686, presales: 466, sales: 35, p_sp: 7.51,  p_pt: 27.6394, p_st: 2.0759, bonus: 154.0  },
    { name: 'Warren',    total: 1214, presales: 323, sales: 31, p_sp: 9.60,  p_pt: 26.6063, p_st: 2.5535, bonus: 170.5  },
    { name: 'River',     total: 1504, presales: 730, sales: 29, p_sp: 3.97,  p_pt: 48.5372, p_st: 1.9282, bonus: 127.6  },
    { name: 'Chadwick',  total: 1395, presales: 512, sales: 28, p_sp: 5.47,  p_pt: 36.7025, p_st: 2.0072, bonus: 123.2  },
    { name: 'Hardy',     total: 1623, presales: 399, sales: 28, p_sp: 7.02,  p_pt: 24.5841, p_st: 1.7252, bonus: 123.2  },
    { name: 'Fletcher',  total: 1688, presales: 319, sales: 28, p_sp: 8.78,  p_pt: 18.8981, p_st: 1.6588, bonus: 112.0  },
    { name: 'Mike',      total: 1410, presales: 422, sales: 24, p_sp: 5.69,  p_pt: 29.9291, p_st: 1.7021, bonus: 105.6  },
    { name: 'Holly',     total: 1087, presales: 367, sales: 23, p_sp: 6.27,  p_pt: 33.7626, p_st: 2.1159, bonus: 101.2  },
    { name: 'Robin',     total: 1501, presales: 173, sales: 27, p_sp: 15.61, p_pt: 11.5256, p_st: 1.7988, bonus: 97.2   },
    { name: 'Bill',      total: 1530, presales: 263, sales: 23, p_sp: 8.75,  p_pt: 17.1895, p_st: 1.5033, bonus: 82.8   },
    { name: 'Isaac',     total: 1094, presales: 239, sales: 21, p_sp: 8.79,  p_pt: 21.8464, p_st: 1.9196, bonus: 84.0   },
    { name: 'Florence',  total: 1228, presales: 261, sales: 21, p_sp: 8.05,  p_pt: 21.2541, p_st: 1.7101, bonus: 84.0   },
    { name: 'Bridget',   total: 1493, presales: 480, sales: 27, p_sp: 5.62,  p_pt: 32.1500, p_st: 1.8084, bonus: 118.8  },
    { name: 'Norman',    total: 1289, presales: 550, sales: 32, p_sp: 5.82,  p_pt: 42.6687, p_st: 2.4825, bonus: 140.8  },
    { name: 'Gross',     total: 2601, presales: 436, sales: 30, p_sp: 6.88,  p_pt: 16.7628, p_st: 1.1534, bonus: 108.0  },
    { name: 'Casper',    total: 1542, presales: 387, sales: 30, p_sp: 7.75,  p_pt: 25.0973, p_st: 1.9455, bonus: 132.0  },
    { name: 'Felicia',   total: 831,  presales: 253, sales: 15, p_sp: 5.93,  p_pt: 30.4452, p_st: 1.8051, bonus: 66.0   },
    { name: 'Alexia',    total: 1105, presales: 480, sales: 14, p_sp: 2.92,  p_pt: 43.4389, p_st: 1.2670, bonus: 61.6   },
    { name: 'Trinity',   total: 1064, presales: 158, sales: 12, p_sp: 7.59,  p_pt: 14.8496, p_st: 1.1278, bonus: 43.2   },
    { name: 'Nolan',     total: 503,  presales: 100, sales: 8,  p_sp: 8.00,  p_pt: 19.8807, p_st: 1.5905, bonus: 32.0   },
    { name: 'Bob',       total: 2066, presales: 181, sales: 19, p_sp: 10.50, p_pt: 8.7609,  p_st: 0.9197, bonus: 24.225 },
    { name: 'Charles',   total: 1767, presales: 215, sales: 11, p_sp: 5.12,  p_pt: 12.1675, p_st: 0.6225, bonus: 24.75  },
    { name: 'Denzel',    total: 1491, presales: 313, sales: 8,  p_sp: 2.56,  p_pt: 20.9926, p_st: 0.5366, bonus: 20.0   },
    { name: 'Meadow',    total: 870,  presales: 73,  sales: 10, p_sp: 13.70, p_pt: 8.3908,  p_st: 1.1494, bonus: 20.4   },
    { name: 'Skylar',    total: 1811, presales: 150, sales: 16, p_sp: 10.67, p_pt: 8.2827,  p_st: 0.8835, bonus: 20.4   },
    { name: 'Calvin',    total: 1477, presales: 253, sales: 16, p_sp: 6.32,  p_pt: 17.1293, p_st: 1.0833, bonus: 57.6   },
    { name: 'Bowen',     total: 1708, presales: 334, sales: 25, p_sp: 7.49,  p_pt: 19.5550, p_st: 1.4637, bonus: 100.0  },
    { name: 'Joseph',    total: 609,  presales: 60,  sales: 7,  p_sp: 11.67, p_pt: 9.8522,  p_st: 1.1494, bonus: 14.28  },
    { name: 'Simon',     total: 1710, presales: 131, sales: 11, p_sp: 8.40,  p_pt: 7.6608,  p_st: 0.6433, bonus: 14.025 },
    { name: 'Elijah',    total: 1031, presales: 122, sales: 7,  p_sp: 5.74,  p_pt: 11.8332, p_st: 0.6790, bonus: 15.75  },
    { name: 'Plover',    total: 931,  presales: 210, sales: 6,  p_sp: 2.86,  p_pt: 22.5564, p_st: 0.6445, bonus: 15.0   },
    { name: 'Murphy',    total: 1601, presales: 159, sales: 9,  p_sp: 5.66,  p_pt: 9.9313,  p_st: 0.5621, bonus: 11.475 },
    { name: 'Nora',      total: 1797, presales: 151, sales: 5,  p_sp: 3.31,  p_pt: 8.4029,  p_st: 0.2782, bonus: 6.375  },
    { name: 'Kiana',     total: 851,  presales: 51,  sales: 5,  p_sp: 9.80,  p_pt: 5.9929,  p_st: 0.5875, bonus: 6.375  },
    { name: 'Wade',      total: 626,  presales: 75,  sales: 2,  p_sp: 2.67,  p_pt: 11.9808, p_st: 0.3195, bonus: 4.5    },
    { name: 'Reggie',    total: 315,  presales: 20,  sales: 3,  p_sp: 15.00, p_pt: 6.3492,  p_st: 0.9524, bonus: 3.825  },
    { name: 'Fabio',     total: 867,  presales: 43,  sales: 2,  p_sp: 4.65,  p_pt: 4.9596,  p_st: 0.2307, bonus: 0.0    },
    { name: 'Morgan',    total: 876,  presales: 38,  sales: 4,  p_sp: 10.53, p_pt: 4.3379,  p_st: 0.4566, bonus: 0.0    },
  ],
  jun: [], jul: [], aug: [], sep: [], oct: [], nov: [], dec: [],
};

// ─── Color helpers ────────────────────────────────────────────────────────────

function stColor(v: number): string {
  if (v <= 1.5) return '#EF4444';
  if (v <= 3)   return '#F97316';
  if (v <= 4)   return '#EAB308';
  if (v <= 4.5) return '#84CC16';
  if (v < 5)    return '#84CC16';
  return '#22C55E';
}

function ptColor(v: number): string {
  if (v <= 10)  return '#EF4444';
  if (v <= 20)  return '#F97316';
  if (v <= 25)  return '#EAB308';
  if (v < 30)   return '#84CC16';
  return '#22C55E';
}

// ─── XLSX processing ──────────────────────────────────────────────────────────

function processRows(rawRows: unknown[][]): { filtered: SalesRow[]; dateFrom: string | null; dateTo: string | null } {
  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  for (const row of rawRows) {
    const cell = String(row[0] || '');
    if (cell.includes('Примененные фильтры') || cell.includes('Date начиная с')) {
      const fromMatch = cell.match(/начиная с (\d{2}\.\d{2}\.\d{4})/);
      const toMatch   = cell.match(/и до (\d{2}\.\d{2}\.\d{4})/);
      if (fromMatch) {
        const [d, m, y] = fromMatch[1].split('.');
        dateFrom = `${y}-${m}-${d}T00:00:00`;
      }
      if (toMatch) {
        const [d, m, y] = toMatch[1].split('.');
        const dt = new Date(`${y}-${m}-${d}`);
        dt.setDate(dt.getDate() - 1);
        dateTo = dt.toISOString().split('T')[0] + 'T23:59:59';
      }
      break;
    }
  }

  let headerIdx = -1;
  for (let i = 0; i < rawRows.length; i++) {
    const cell = String(rawRows[i][0]);
    if (cell.includes('Имя оператора') || cell.toLowerCase().includes('оператор')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) headerIdx = 0;

  const headers = rawRows[headerIdx].map(h => String(h).trim());
  const colIdx = {
    name:     headers.findIndex(h => h.includes('оператор') || h.includes('Имя')),
    total:    headers.findIndex(h => h.includes('Всего чатов') || h === 'Total'),
    presales: headers.findIndex(h => h.includes('Предпродажи')),
    sales:    headers.findIndex(h => h === 'Продажи' || (h.includes('Продажи') && !h.includes('/'))),
  };

  const rows: SalesRow[] = [];
  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i] as unknown[];
    const name = String(row[colIdx.name] || '').trim();
    if (!name) continue;
    if (name.toLowerCase() === 'total' || name.toLowerCase().includes('итог')) continue;
    if (name.toLowerCase().includes('примен')) continue;
    if (EXCLUDE_NAMES.includes(name.toLowerCase())) continue;

    const total    = parseFloat(String(row[colIdx.total]))    || 0;
    const presales = parseFloat(String(row[colIdx.presales])) || 0;
    const sales    = parseFloat(String(row[colIdx.sales]))    || 0;

    if (total < 10) continue;

    const p_sp = presales > 0 ? Math.round(sales / presales * 10000) / 100 : null;
    const p_pt = total > 0    ? Math.round(presales / total * 10000) / 100 : 0;
    const p_st = total > 0    ? Math.round(sales / total * 10000) / 100 : 0;

    let k1 = 0;
    if (p_pt > 30)       k1 = 1.1;
    else if (p_pt >= 25) k1 = 1.0;
    else if (p_pt >= 20) k1 = 0.9;
    else if (p_pt >= 10) k1 = 0.5;
    else                 k1 = 0.0;

    let k2 = 0;
    if (p_st >= 5)        k2 = 1.3;
    else if (p_st >= 4.5) k2 = 1.2;
    else if (p_st >= 4)   k2 = 1.1;
    else if (p_st >= 3)   k2 = 1.0;
    else if (p_st >= 1.5) k2 = 0.8;
    else                  k2 = 0.5;

    const bonus = k1 === 0 ? 0 : Math.round(sales * 5 * k1 * k2 * 10000) / 10000;

    rows.push({ name, total: Math.round(total), presales: Math.round(presales), sales: Math.round(sales), p_sp, p_pt, p_st, bonus });
  }

  rows.sort((a, b) => b.bonus - a.bonus || b.sales - a.sales);
  return { filtered: rows, dateFrom, dateTo };
}

// ─── Date label formatting ────────────────────────────────────────────────────

function fmtDate(s: string): string {
  const d = new Date(s);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────

type SortState = { col: ColKey; dir: 1 | -1 };

function sortData(data: SalesRow[], col: ColKey, dir: 1 | -1): SalesRow[] {
  return [...data].sort((a, b) => {
    if (col === 'name') return dir * a.name.localeCompare(b.name);
    if (col === 'rank') return 0;
    const va = (a as unknown as Record<string, number | null>)[col] ?? -Infinity;
    const vb = (b as unknown as Record<string, number | null>)[col] ?? -Infinity;
    return dir * (va - vb);
  });
}

// ─── SalesTable component ─────────────────────────────────────────────────────

interface SalesTableProps {
  month: Month;
  rows: SalesRow[];
  isTl: boolean;
  dateFrom: string | null;
  dateTo: string | null;
  onUpload: (month: Month) => void;
  onClear: (month: Month) => void;
}

function SalesTable({ month, rows, isTl, dateFrom, dateTo, onUpload, onClear }: SalesTableProps) {
  const [sort, setSort] = useState<SortState>({ col: 'bonus', dir: -1 });

  const filtered = rows.filter(r => r.name && r.name !== '—' && r.name.trim() !== '');
  const byBonus = [...filtered].sort((a, b) => b.bonus - a.bonus || b.sales - a.sales);
  const rankMap: Record<string, number> = {};
  byBonus.forEach((r, i) => { rankMap[r.name] = i + 1; });

  const displayData = (sort.col === 'rank' && sort.dir === -1) ? byBonus : sortData(filtered, sort.col, sort.dir);

  function handleSort(key: ColKey) {
    if (key === 'rank') return;
    setSort(prev => prev.col === key ? { col: key, dir: (prev.dir === -1 ? 1 : -1) as 1 | -1 } : { col: key, dir: -1 });
  }

  function sortArrow(key: ColKey) {
    if (key === 'rank') return null;
    if (sort.col === key) {
      return <span className="sort-arrow" style={{ color: 'var(--green)' }}>{sort.dir === -1 ? ' ↓' : ' ↑'}</span>;
    }
    return <span className="sort-arrow" style={{ color: 'rgba(90,112,102,0.5)', fontSize: 10 }}> ⇅</span>;
  }

  return (
    <>
      <div className="sales-section-header">
        <span className="icon">📈</span>
        <span>Рейтинг продаж — {MONTH_NAMES[month]} 2026</span>
        <span className="line" />
        {dateFrom && dateTo ? (
          <span className="date-label">
            🕐 Данные с <span style={{ color: 'var(--green)', fontWeight: 700 }}>{fmtDate(dateFrom)}</span>{' '}
            по <span style={{ color: 'var(--green)', fontWeight: 700 }}>{fmtDate(dateTo)}</span>
          </span>
        ) : (
          <span className="date-label" />
        )}
        {isTl && (
          <>
            <button className="sales-upload-btn" onClick={() => onUpload(month)}>⬆ Обновить</button>
            <button className="sales-clear-btn" onClick={() => onClear(month)}>✕ Очистить</button>
          </>
        )}
      </div>
      <div className="sales-table-wrapper">
        <table className="sales-tbl">
          <thead>
            <tr>
              {(['rank', 'name', 'total', 'presales', 'sales', 'p_sp', 'p_pt', 'p_st', 'bonus'] as ColKey[]).map((key, i) => {
                const labels: Record<ColKey, string> = {
                  rank: '#', name: 'Оператор', total: 'Всего чатов', presales: 'Предложения',
                  sales: 'Активации', p_sp: 'Акт / Оффер', p_pt: 'Оффер / Тотал', p_st: 'Акт / Тотал', bonus: 'Бонус ($)',
                };
                const titles: Partial<Record<ColKey, string>> = {
                  p_sp: 'Активации / Офферов', p_pt: 'Офферов / Всего чатов', p_st: 'Активации / Всего чатов',
                };
                return (
                  <th key={key} title={titles[key]} onClick={() => handleSort(key)} style={key === 'rank' ? { cursor: 'default' } : undefined}>
                    {labels[key]}{sortArrow(key)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: 13 }}>
                  Данные за этот месяц ещё не загружены
                </td>
              </tr>
            ) : displayData.map((row, idx) => {
              const rank = rankMap[row.name];
              const rowClass = rank <= 3 ? `sales-row-${rank}` : '';
              return (
                <tr key={`${row.name}-${idx}`} className={rowClass}>
                  <td>
                    {rank <= 3
                      ? <span className="rank-icon">{TOP_ICONS[rank - 1]}</span>
                      : <span style={{ color: 'var(--text-muted)', fontFamily: "'Barlow Condensed',sans-serif", fontSize: 15 }}>{rank}</span>
                    }
                  </td>
                  <td>{row.name}</td>
                  <td>{row.total != null ? row.total.toLocaleString('ru') : '—'}</td>
                  <td>{row.presales != null ? row.presales : '—'}</td>
                  <td>{row.sales}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{row.p_sp != null ? row.p_sp.toFixed(2) + '%' : '—'}</td>
                  <td>
                    {row.p_pt != null
                      ? <span style={{ color: ptColor(row.p_pt), fontWeight: 700 }}>{row.p_pt.toFixed(2)}%</span>
                      : '—'}
                  </td>
                  <td>
                    {row.p_st != null
                      ? <span style={{ color: stColor(row.p_st), fontWeight: 700 }}>{row.p_st.toFixed(2)}%</span>
                      : '—'}
                  </td>
                  <td>
                    {row.bonus > 0
                      ? <span className="bonus-cell">${row.bonus % 1 === 0 ? row.bonus : row.bonus.toFixed(2)}</span>
                      : <span className="bonus-cell zero">—</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Upload modal ─────────────────────────────────────────────────────────────

interface UploadModalState {
  icon: string;
  title: string;
  msg: string;
  done: boolean;
}

// ─── Main SalesPage ───────────────────────────────────────────────────────────

export default function SalesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Auth
  const { data: authData, isLoading: authLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: async () => {
      const res = await fetch('/api/check', { credentials: 'include' });
      if (!res.ok) return null;
      return res.json() as Promise<{ ok: boolean; email: string; role: string }>;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const isTl = authData?.role === 'tl' || authData?.role === 'ops';

  // Sales data query
  const { data: salesApiData } = useQuery<SalesApiResponse>({
    queryKey: ['sales-data'],
    queryFn: async () => {
      const res = await fetch('/api/sales/data', { credentials: 'include' });
      return res.json();
    },
    enabled: !!authData?.ok,
  });

  // Merge embedded data with API data
  const salesData: Record<Month, SalesRow[]> = { ...EMBEDDED_DATA };
  const dateMeta: Record<Month, { dateFrom: string | null; dateTo: string | null }> = {} as Record<Month, { dateFrom: string | null; dateTo: string | null }>;
  ALL_MONTHS.forEach(m => { dateMeta[m] = { dateFrom: null, dateTo: null }; });

  if (salesApiData?.ok) {
    for (const m of ALL_MONTHS) {
      if (salesApiData.data[m]) {
        const { rows, dateFrom, dateTo } = salesApiData.data[m];
        if (rows && rows.length > 0) {
          salesData[m] = rows;
        }
        dateMeta[m] = { dateFrom: dateFrom || null, dateTo: dateTo || null };
      }
    }
  }

  // Tab state
  const [activeMonth, setActiveMonth] = useState<Month>('may');

  // Theme
  const [isLight, setIsLight] = useState(() => {
    if (typeof window === 'undefined') return false;
    return document.documentElement.classList.contains('light') || localStorage.getItem('theme') === 'light';
  });

  useEffect(() => {
    if (isLight) {
      document.documentElement.classList.add('light');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    }
  }, [isLight]);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetMonth, setUploadTargetMonth] = useState<Month | null>(null);
  const [uploadModal, setUploadModal] = useState<UploadModalState | null>(null);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ month, rows, dateFrom, dateTo }: { month: Month; rows: SalesRow[]; dateFrom: string | null; dateTo: string | null }) => {
      const res = await fetch('/api/sales/upload', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, rows, dateFrom, dateTo }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Ошибка сервера');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-data'] });
    },
  });

  // Auth guard
  useEffect(() => {
    if (!authLoading && !authData?.ok) {
      navigate('/login', { replace: true });
    }
  }, [authLoading, authData, navigate]);

  // Stats for current month
  const currentData = salesData[activeMonth].filter(r => r.name && r.name !== '—');
  const totalChats    = currentData.reduce((s, r) => s + (r.total    ?? 0), 0);
  const totalPresales = currentData.reduce((s, r) => s + (r.presales ?? 0), 0);
  const totalSales    = currentData.reduce((s, r) => s + (r.sales    ?? 0), 0);
  const totalBonus    = currentData.reduce((s, r) => s + (r.bonus    ?? 0), 0);
  const ppt = totalChats > 0 ? (totalPresales / totalChats * 100) : 0;
  const pst = totalChats > 0 ? (totalSales    / totalChats * 100) : 0;

  function triggerUpload(month: Month) {
    setUploadTargetMonth(month);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadTargetMonth) return;
    setUploadModal({ icon: '⏳', title: 'Читаем файл...', msg: '', done: false });

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];

      setUploadModal({ icon: '📊', title: 'Обрабатываем данные...', msg: `Найдено строк: ${rawRows.length}`, done: false });

      const { filtered, dateFrom, dateTo } = processRows(rawRows);
      setUploadModal({ icon: '☁️', title: 'Сохраняем в облако...', msg: `Операторов: ${filtered.length}`, done: false });

      await uploadMutation.mutateAsync({ month: uploadTargetMonth, rows: filtered, dateFrom, dateTo });
      setUploadModal({
        icon: '✅',
        title: 'Данные обновлены!',
        msg: `Загружено ${filtered.length} операторов за ${PERIOD_LABELS[uploadTargetMonth]}`,
        done: true,
      });
    } catch (err) {
      setUploadModal({ icon: '❌', title: 'Ошибка загрузки', msg: String(err instanceof Error ? err.message : err), done: true });
    }
  }

  async function handleClear(month: Month) {
    if (!confirm(`Очистить данные за ${PERIOD_LABELS[month]}? Это действие нельзя отменить.`)) return;
    try {
      await uploadMutation.mutateAsync({ month, rows: [], dateFrom: null, dateTo: null });
    } catch (err) {
      alert('Ошибка при очистке: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#080C10', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.08)', borderTopColor: '#00D68F', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  return (
    <div className={`sales-root${isLight ? ' light' : ''}`}>
      <div className="sales-bg-overlay" />
      <div className="sales-page-wrap">
        {/* Theme toggle */}
        <button className="sales-theme-toggle" onClick={() => setIsLight(v => !v)} title="Переключить тему">
          {isLight ? '☀️' : '🌙'}
        </button>

        <div className="sales-container">
          {/* Header */}
          <div className="sales-header">
            <div className="sales-header-icon">💰</div>
            <div className="sales-header-text">
              <h1>Рейтинг продаж</h1>
              <div className="subtitle">Bonus Activations · Support Team · 2026</div>
            </div>
            <div className="sales-header-badge">
              <div className="badge-label">Период</div>
              <div className="badge-value">{PERIOD_LABELS[activeMonth]}</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="sales-tabs">
            {ALL_MONTHS.map(m => (
              <div
                key={m}
                className={`sales-tab${activeMonth === m ? ' active' : ''}`}
                onClick={() => setActiveMonth(m)}
              >
                {MONTH_NAMES[m]}
              </div>
            ))}
          </div>

          {/* Stats strip */}
          <div className="sales-stats-strip">
            <div className="sales-stat-item">
              <div className="sales-stat-label">Активации</div>
              <div className="sales-stat-value green">{totalSales}</div>
              <div className="sales-stat-sub">активаций за месяц</div>
            </div>
            <div className="sales-stat-item">
              <div className="sales-stat-label">Предложения</div>
              <div className="sales-stat-value">{totalPresales}</div>
              <div className="sales-stat-sub">офферов за месяц</div>
            </div>
            <div className="sales-stat-item">
              <div className="sales-stat-label">Оффер / Тотал</div>
              <div className="sales-stat-value">{ppt.toFixed(2)}%</div>
              <div className="sales-stat-sub">конверсия в оффер</div>
            </div>
            <div className="sales-stat-item">
              <div className="sales-stat-label">Акт / Тотал</div>
              <div className="sales-stat-value">{pst.toFixed(2)}%</div>
              <div className="sales-stat-sub">конверсия в активацию</div>
            </div>
            <div className="sales-stat-item">
              <div className="sales-stat-label">Суммарный бонус</div>
              <div className="sales-stat-value green">${totalBonus.toFixed(2)}</div>
              <div className="sales-stat-sub">к выплате</div>
            </div>
          </div>

          {/* Legend */}
          <div className="sales-legend-block">
            <div className="legend-formula-title">Формула бонуса</div>
            <div className="legend-formula-desc">Бонус = Активации × $5 × К₁ (оффер) × К₂ (активация)</div>
            <div className="legend-tables">
              <div className="legend-table-wrap">
                <div className="legend-table-title">
                  Конверсия в оффер (К₁)<br /><span>% чатов с предложением бонуса</span>
                </div>
                <table className="legend-tbl">
                  <tbody>
                    <tr><td><span style={{ color: '#EF4444' }}>≤ 10%</span></td><td>× 0.0</td></tr>
                    <tr><td><span style={{ color: '#F97316' }}>10 – 20%</span></td><td>× 0.5</td></tr>
                    <tr><td><span style={{ color: '#EAB308' }}>20 – 25%</span></td><td>× 0.9</td></tr>
                    <tr><td><span style={{ color: '#84CC16' }}>25 – 30%</span></td><td>× 1.0</td></tr>
                    <tr><td><span style={{ color: '#22C55E' }}>≥ 30%</span></td><td>× 1.1</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="legend-table-wrap">
                <div className="legend-table-title">
                  Конверсия в активацию (К₂)<br /><span>% активаций от всей базы чатов</span>
                </div>
                <table className="legend-tbl">
                  <tbody>
                    <tr><td><span style={{ color: '#EF4444' }}>≤ 1.5%</span></td><td>× 0.5</td></tr>
                    <tr><td><span style={{ color: '#F97316' }}>1.5 – 3%</span></td><td>× 0.8</td></tr>
                    <tr><td><span style={{ color: '#EAB308' }}>3 – 4%</span></td><td>× 1.0</td></tr>
                    <tr><td><span style={{ color: '#84CC16' }}>4% – 4.5%</span></td><td>× 1.1</td></tr>
                    <tr><td><span style={{ color: '#84CC16' }}>4.5 – 5%</span></td><td>× 1.2</td></tr>
                    <tr><td><span style={{ color: '#22C55E' }}>≥ 5%</span></td><td>× 1.3</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Active month table */}
          <SalesTable
            month={activeMonth}
            rows={salesData[activeMonth]}
            isTl={isTl}
            dateFrom={dateMeta[activeMonth].dateFrom}
            dateTo={dateMeta[activeMonth].dateTo}
            onUpload={triggerUpload}
            onClear={handleClear}
          />

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />

          {/* Footer */}
          <div className="sales-footer">✦ Support Sales Activations 2026 ✦</div>
        </div>
      </div>

      {/* Upload modal */}
      {uploadModal && (
        <div className="sales-upload-overlay">
          <div className="sales-upload-modal">
            <div className="sales-upload-modal-icon">{uploadModal.icon}</div>
            <div className="sales-upload-modal-title">{uploadModal.title}</div>
            <div className="sales-upload-modal-msg">{uploadModal.msg}</div>
            {uploadModal.done && (
              <button
                className="sales-upload-modal-close"
                onClick={() => { setUploadModal(null); setUploadTargetMonth(null); }}
              >
                Готово
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
