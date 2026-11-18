import { formatR, positionSize, TrustSummary } from '../lib/setupTrust';
import './setup-trust.css';

const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/** Compact status pill for list rows. */
export function TrustPill({ trust }: { trust: TrustSummary }) {
  return <span className={`sd-trust-pill ${trust.status.toLowerCase()}`} title={trust.headline}>{trust.label}</span>;
}

/** Evidence and position size for the selected setup, shown in the trade plan. */
export function SetupTrustPanel({ trust, entry, stop, capital, maxRiskPct, availableCash }: {
  trust: TrustSummary;
  entry?: number;
  stop?: number;
  capital?: number;
  maxRiskPct?: number;
  availableCash?: number;
}) {
  const test = trust.evidence?.test;
  const size = entry && stop && capital && maxRiskPct
    ? positionSize({ capital, maxRiskPct, entry, stop, availableCash })
    : null;
  const tradeable = trust.status === 'TRUSTED';
  return (
    <section className={`sd-trust ${trust.status.toLowerCase()}`} aria-label="Setup trust">
      <div className="sd-trust-head">
        <TrustPill trust={trust} />
        <span>Setup evidence</span>
      </div>
      <p className="sd-trust-headline">{trust.headline}</p>
      {test && test.n > 0 && (
        <dl className="sd-trust-stats">
          <div><dt>2024+ trades</dt><dd>{test.n.toLocaleString('en-IN')}</dd></div>
          <div><dt>Avg result</dt><dd className={test.avgNetR >= 0 ? 'sd-positive' : 'sd-negative'}>{formatR(test.avgNetR)}</dd></div>
          <div><dt>Target first</dt><dd>{test.targetPct.toFixed(0)}%</dd></div>
          <div><dt>+5% first</dt><dd>{trust.evidence?.goalRateTest == null ? '—' : `${trust.evidence.goalRateTest.toFixed(0)}%`}</dd></div>
        </dl>
      )}
      {size && (
        <div className="sd-size">
          <div className="sd-size-row"><span>{tradeable ? 'Position size' : 'Size if it were trusted'}</span><strong>{size.shares.toLocaleString('en-IN')} shares</strong></div>
          <div className="sd-size-row"><span>Amount</span><strong>{money(size.amount)}</strong></div>
          <div className="sd-size-row"><span>Loss if stopped</span><strong>{money(size.riskAmount)}</strong></div>
          <p className="sd-size-note">
            {size.limitedBy === 'POSITION_CAP' ? 'Capped at 20% of capital per position.'
              : size.limitedBy === 'CASH' ? 'Limited by available cash.'
                : `Risks ${maxRiskPct}% of capital at the stop.`}
          </p>
        </div>
      )}
    </section>
  );
}
