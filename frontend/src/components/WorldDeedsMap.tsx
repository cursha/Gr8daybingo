import React, { useEffect, useState, useCallback } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, Globe, ArrowLeft, Loader2, X, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  getWorldDeeds,
  getCountryDrillDown,
  WorldDeedsCountry,
  CountryDeedEntry,
} from '@/lib/game-utils';
import { useAuth } from '@/contexts/AuthContext';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const NUMERIC_TO_ALPHA2: Record<string, string> = {
  '004': 'AF', '008': 'AL', '012': 'DZ', '020': 'AD', '024': 'AO', '028': 'AG',
  '032': 'AR', '051': 'AM', '036': 'AU', '040': 'AT', '031': 'AZ', '044': 'BS',
  '048': 'BH', '050': 'BD', '052': 'BB', '112': 'BY', '056': 'BE', '084': 'BZ',
  '204': 'BJ', '064': 'BT', '068': 'BO', '070': 'BA', '072': 'BW', '076': 'BR',
  '096': 'BN', '100': 'BG', '854': 'BF', '108': 'BI', '132': 'CV', '116': 'KH',
  '120': 'CM', '124': 'CA', '140': 'CF', '148': 'TD', '152': 'CL', '156': 'CN',
  '170': 'CO', '174': 'KM', '178': 'CG', '188': 'CR', '191': 'HR', '192': 'CU',
  '196': 'CY', '203': 'CZ', '208': 'DK', '262': 'DJ', '212': 'DM', '214': 'DO',
  '218': 'EC', '818': 'EG', '222': 'SV', '226': 'GQ', '232': 'ER', '233': 'EE',
  '748': 'SZ', '231': 'ET', '242': 'FJ', '246': 'FI', '250': 'FR', '266': 'GA',
  '270': 'GM', '268': 'GE', '276': 'DE', '288': 'GH', '300': 'GR', '308': 'GD',
  '320': 'GT', '324': 'GN', '624': 'GW', '328': 'GY', '332': 'HT', '340': 'HN',
  '348': 'HU', '352': 'IS', '356': 'IN', '360': 'ID', '364': 'IR', '368': 'IQ',
  '372': 'IE', '376': 'IL', '380': 'IT', '388': 'JM', '392': 'JP', '400': 'JO',
  '398': 'KZ', '404': 'KE', '296': 'KI', '414': 'KW', '417': 'KG', '418': 'LA',
  '428': 'LV', '422': 'LB', '426': 'LS', '430': 'LR', '434': 'LY', '438': 'LI',
  '440': 'LT', '442': 'LU', '450': 'MG', '454': 'MW', '458': 'MY', '462': 'MV',
  '466': 'ML', '470': 'MT', '584': 'MH', '478': 'MR', '480': 'MU', '484': 'MX',
  '583': 'FM', '498': 'MD', '492': 'MC', '496': 'MN', '499': 'ME', '504': 'MA',
  '508': 'MZ', '104': 'MM', '516': 'NA', '520': 'NR', '524': 'NP', '528': 'NL',
  '554': 'NZ', '558': 'NI', '562': 'NE', '566': 'NG', '408': 'KP', '807': 'MK',
  '578': 'NO', '512': 'OM', '586': 'PK', '585': 'PW', '591': 'PA', '598': 'PG',
  '600': 'PY', '604': 'PE', '608': 'PH', '616': 'PL', '620': 'PT', '634': 'QA',
  '642': 'RO', '643': 'RU', '646': 'RW', '659': 'KN', '662': 'LC', '670': 'VC',
  '882': 'WS', '674': 'SM', '678': 'ST', '682': 'SA', '686': 'SN', '688': 'RS',
  '690': 'SC', '694': 'SL', '702': 'SG', '703': 'SK', '705': 'SI', '090': 'SB',
  '706': 'SO', '710': 'ZA', '410': 'KR', '728': 'SS', '724': 'ES', '144': 'LK',
  '729': 'SD', '740': 'SR', '752': 'SE', '756': 'CH', '760': 'SY', '158': 'TW',
  '762': 'TJ', '834': 'TZ', '764': 'TH', '626': 'TL', '768': 'TG', '776': 'TO',
  '780': 'TT', '788': 'TN', '792': 'TR', '795': 'TM', '798': 'TV', '800': 'UG',
  '804': 'UA', '784': 'AE', '826': 'GB', '840': 'US', '858': 'UY', '860': 'UZ',
  '548': 'VU', '336': 'VA', '862': 'VE', '704': 'VN', '887': 'YE', '894': 'ZM',
  '716': 'ZW',
};

// Demo data shown to logged-out visitors
const DEMO_COUNTRIES: WorldDeedsCountry[] = [
  { country_code: 'CA', country_name: 'Canada', total_deeds: 47 },
  { country_code: 'US', country_name: 'United States', total_deeds: 38 },
  { country_code: 'GB', country_name: 'United Kingdom', total_deeds: 21 },
  { country_code: 'AU', country_name: 'Australia', total_deeds: 14 },
  { country_code: 'IE', country_name: 'Ireland', total_deeds: 9 },
  { country_code: 'NZ', country_name: 'New Zealand', total_deeds: 7 },
  { country_code: 'DE', country_name: 'Germany', total_deeds: 5 },
  { country_code: 'FR', country_name: 'France', total_deeds: 4 },
  { country_code: 'IN', country_name: 'India', total_deeds: 3 },
  { country_code: 'BR', country_name: 'Brazil', total_deeds: 2 },
];

const DEMO_DRILL: Record<string, CountryDeedEntry[]> = {
  CA: [
    { deed_id: 1, deed_text: 'Hold the door open for someone', count: 12 },
    { deed_id: 2, deed_text: 'Pay for a stranger\'s coffee', count: 8 },
    { deed_id: 3, deed_text: 'Leave a kind note for a neighbour', count: 7 },
    { deed_id: 4, deed_text: 'Compliment someone\'s effort', count: 6 },
    { deed_id: 5, deed_text: 'Donate to a local food bank', count: 5 },
    { deed_id: 6, deed_text: 'Help carry someone\'s groceries', count: 4 },
    { deed_id: 7, deed_text: 'Smile and say hello to a stranger', count: 5 },
  ],
  US: [
    { deed_id: 1, deed_text: 'Hold the door open for someone', count: 10 },
    { deed_id: 8, deed_text: 'Leave coins at a parking meter', count: 7 },
    { deed_id: 9, deed_text: 'Write a thank-you note', count: 6 },
    { deed_id: 3, deed_text: 'Leave a kind note for a neighbour', count: 5 },
    { deed_id: 10, deed_text: 'Volunteer for an hour', count: 4 },
    { deed_id: 2, deed_text: 'Pay for a stranger\'s coffee', count: 6 },
  ],
  GB: [
    { deed_id: 1, deed_text: 'Hold the door open for someone', count: 8 },
    { deed_id: 11, deed_text: 'Check in on an elderly neighbour', count: 6 },
    { deed_id: 4, deed_text: 'Compliment someone\'s effort', count: 4 },
    { deed_id: 9, deed_text: 'Write a thank-you note', count: 3 },
  ],
  AU: [
    { deed_id: 2, deed_text: 'Pay for a stranger\'s coffee', count: 5 },
    { deed_id: 7, deed_text: 'Smile and say hello to a stranger', count: 4 },
    { deed_id: 10, deed_text: 'Volunteer for an hour', count: 3 },
    { deed_id: 1, deed_text: 'Hold the door open for someone', count: 2 },
  ],
  IE: [
    { deed_id: 3, deed_text: 'Leave a kind note for a neighbour', count: 4 },
    { deed_id: 7, deed_text: 'Smile and say hello to a stranger', count: 3 },
    { deed_id: 4, deed_text: 'Compliment someone\'s effort', count: 2 },
  ],
};

function deedColor(count: number, max: number): string {
  if (count === 0 || max === 0) return '#e2e8f0';
  const ratio = Math.sqrt(count / max);
  const stops = [
    [226, 232, 240],
    [165, 180, 252],
    [99, 102, 241],
    [67, 56, 202],
    [49, 10, 101],
  ];
  const idx = ratio * (stops.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, stops.length - 1);
  const t = idx - lo;
  const r = Math.round(stops[lo][0] + t * (stops[hi][0] - stops[lo][0]));
  const g = Math.round(stops[lo][1] + t * (stops[hi][1] - stops[lo][1]));
  const b = Math.round(stops[lo][2] + t * (stops[hi][2] - stops[lo][2]));
  return `rgb(${r},${g},${b})`;
}

interface DrillPanelProps {
  countryCode: string;
  countryName: string;
  deeds: CountryDeedEntry[];
  total: number;
  loading: boolean;
  onClose: () => void;
}

const DrillPanel: React.FC<DrillPanelProps> = ({ countryName, deeds, total, loading, onClose }) => (
  <Card className="border-indigo-200 shadow-lg">
    <CardHeader className="border-b border-slate-100 pb-3">
      <div className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-slate-800 text-base">
          <Button variant="ghost" size="icon" className="h-7 w-7 mr-1" onClick={onClose}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span>{countryName}</span>
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      {!loading && (
        <p className="text-xs text-slate-500 pl-10">
          <strong className="text-slate-700">{total}</strong> Gr8Day {total === 1 ? 'Deed' : 'Deeds'} completed here
        </p>
      )}
    </CardHeader>
    <CardContent className="p-4">
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      ) : deeds.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">No deeds recorded for this country yet.</p>
      ) : (
        <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {deeds.map((d) => (
            <li key={d.deed_id} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-slate-700">
                <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-300 flex-shrink-0" />
                {d.deed_text}
              </span>
              <span className="flex-shrink-0 font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full text-xs">
                ×{d.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);

const WorldDeedsMap: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const isLoggedIn = !!user;

  const [countries, setCountries] = useState<WorldDeedsCountry[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ name: string; deeds: number; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drillData, setDrillData] = useState<{ name: string; deeds: CountryDeedEntry[]; total: number } | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) {
      setCountries(DEMO_COUNTRIES);
      setGrandTotal(DEMO_COUNTRIES.reduce((s, c) => s + c.total_deeds, 0));
      setLoading(false);
      return;
    }
    getWorldDeeds()
      .then((d) => { setCountries(d.countries); setGrandTotal(d.grand_total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isLoggedIn, authLoading]);

  const countByCode = new Map(countries.map((c) => [c.country_code, c]));
  const max = Math.max(...countries.map((c) => c.total_deeds), 1);

  const handleCountryClick = useCallback(async (code: string, name: string) => {
    if (!countByCode.has(code)) return;
    setSelected(code);
    setDrillData(null);
    setDrillLoading(true);
    try {
      if (!isLoggedIn) {
        // Show demo drill-down data
        await new Promise((r) => setTimeout(r, 300)); // small delay for UX
        const demoDeeds = DEMO_DRILL[code] ?? [];
        setDrillData({ name, deeds: demoDeeds, total: demoDeeds.reduce((s, d) => s + d.count, 0) });
      } else {
        const res = await getCountryDrillDown(code);
        setDrillData({ name: res.country_name || name, deeds: res.deeds, total: res.total });
      }
    } catch {
      setDrillData({ name, deeds: [], total: 0 });
    } finally {
      setDrillLoading(false);
    }
  }, [countByCode, isLoggedIn]);

  return (
    <Card className="border-slate-200 shadow-lg mt-6">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="flex items-center gap-2 text-slate-800">
          <Globe className="w-5 h-5 text-indigo-500" />
          Gr8Day Deeds Worldwide
          {!loading && (
            <span className="ml-auto text-sm font-normal text-slate-500">
              <strong className="text-slate-700">{grandTotal}</strong> deeds across{' '}
              <strong className="text-slate-700">{countries.length}</strong> {countries.length === 1 ? 'country' : 'countries'}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 md:p-6">
        {/* Demo banner for logged-out visitors */}
        {!authLoading && !isLoggedIn && (
          <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <Sparkles className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <span className="font-semibold text-amber-800">This is a demo.</span>{' '}
              <span className="text-amber-700">Sign in to see real Gr8Day Deeds being done around the world.</span>
            </div>
            <Button
              size="sm"
              className="flex-shrink-0 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-0"
              asChild
            >
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-3 text-center">
              Click a highlighted country to see which Gr8Day Deeds were done there.
            </p>
            <div className="relative w-full rounded-xl overflow-hidden bg-slate-50 border border-slate-100">
              <ComposableMap
                projectionConfig={{ scale: 140, center: [0, 15] }}
                style={{ width: '100%', height: 'auto' }}
              >
                <ZoomableGroup>
                  <Geographies geography={GEO_URL}>
                    {({ geographies }) =>
                      geographies.map((geo) => {
                        const numericId = geo.id as string;
                        const alpha2 = NUMERIC_TO_ALPHA2[numericId] ?? null;
                        const entry = alpha2 ? countByCode.get(alpha2) : undefined;
                        const count = entry?.total_deeds ?? 0;
                        const isSelected = alpha2 === selected;
                        return (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            fill={isSelected ? '#f59e0b' : deedColor(count, max)}
                            stroke="#fff"
                            strokeWidth={0.4}
                            style={{
                              default: { outline: 'none' },
                              hover: { outline: 'none', fill: count > 0 ? '#a5b4fc' : '#cbd5e1', cursor: count > 0 ? 'pointer' : 'default' },
                              pressed: { outline: 'none' },
                            }}
                            onMouseEnter={(e) => {
                              const name = entry?.country_name ?? geo.properties.name ?? alpha2 ?? '';
                              setTooltip({ name, deeds: count, x: e.clientX, y: e.clientY });
                            }}
                            onMouseMove={(e) => {
                              setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : prev);
                            }}
                            onMouseLeave={() => setTooltip(null)}
                            onClick={() => {
                              if (alpha2 && count > 0) handleCountryClick(alpha2, entry?.country_name ?? geo.properties.name ?? '');
                            }}
                          />
                        );
                      })
                    }
                  </Geographies>
                </ZoomableGroup>
              </ComposableMap>

              {/* Tooltip */}
              {tooltip && (
                <div
                  className="fixed z-50 pointer-events-none bg-slate-800 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-lg"
                  style={{ left: tooltip.x + 12, top: tooltip.y - 36 }}
                >
                  <span className="font-semibold">{tooltip.name}</span>
                  {tooltip.deeds > 0 && (
                    <span className="ml-2 text-indigo-300">{tooltip.deeds} deed{tooltip.deeds !== 1 ? 's' : ''}</span>
                  )}
                </div>
              )}
            </div>

            {/* Colour legend */}
            <div className="flex items-center gap-2 mt-3 justify-center text-xs text-slate-500">
              <span>Fewer deeds</span>
              <div className="flex h-3 w-32 rounded overflow-hidden">
                {[0.0, 0.25, 0.5, 0.75, 1.0].map((t) => (
                  <div key={t} className="flex-1" style={{ background: deedColor(t * max, max) }} />
                ))}
              </div>
              <span>More deeds</span>
            </div>

            {/* Drill-down panel */}
            {selected && (
              <div className="mt-4">
                <DrillPanel
                  countryCode={selected}
                  countryName={drillData?.name ?? selected}
                  deeds={drillData?.deeds ?? []}
                  total={drillData?.total ?? 0}
                  loading={drillLoading}
                  onClose={() => { setSelected(null); setDrillData(null); }}
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WorldDeedsMap;
