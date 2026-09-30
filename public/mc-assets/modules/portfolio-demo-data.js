window.MCPortfolioDemoData = (function () {
  const DAY = 24 * 60 * 60 * 1000;
  const SEED = 0x4d43504f;
  const SPECS = [
    { id: 'portfolio-01', companyName: 'UrbanNest Realty', segment: 'Trial / New', plan: 'Lexus', status: 'trial', ageDays: 4, users: 3, callsPerDay: 1.2, connectionRate: 0.62, leadRate: 0.24, qualificationRate: 0.42, avgMinutes: 3.8, rupeesPerMinute: 0, wallet: 0, rechargeCount: 0, rechargeDaysAgo: null, activityMinutesAgo: 7, planHistory: [{ plan: 'Lexus', action: 'Trial started', daysAgo: 4, amount: 0 }], manualCredit: 0, refund: 0 },
    { id: 'portfolio-02', companyName: 'AarnaKey Estates', segment: 'Trial / New', plan: 'Lexus', status: 'trial', ageDays: 11, users: 5, callsPerDay: 2.1, connectionRate: 0.54, leadRate: 0.2, qualificationRate: 0.36, avgMinutes: 4.1, rupeesPerMinute: 0, wallet: 0, rechargeCount: 0, rechargeDaysAgo: null, activityMinutesAgo: 12, planHistory: [{ plan: 'Lexus', action: 'Trial started', daysAgo: 11, amount: 0 }], manualCredit: 0, refund: 0 },
    { id: 'portfolio-03', companyName: 'Nivara Homes', segment: 'Trial / New', plan: 'Lexus', status: 'new', ageDays: 2, users: 2, callsPerDay: 0.8, connectionRate: 0.5, leadRate: 0.18, qualificationRate: 0.3, avgMinutes: 3.4, rupeesPerMinute: 0, wallet: 0, rechargeCount: 0, rechargeDaysAgo: null, activityMinutesAgo: 19, planHistory: [{ plan: 'Lexus', action: 'Trial started', daysAgo: 2, amount: 0 }], manualCredit: 0, refund: 0 },
    { id: 'portfolio-04', companyName: 'Aarambh Estates', segment: 'Small / Low Usage', plan: 'Lexus', status: 'active', ageDays: 142, users: 7, callsPerDay: 1.8, connectionRate: 0.58, leadRate: 0.2, qualificationRate: 0.38, avgMinutes: 4.2, rupeesPerMinute: 8, wallet: 1340, rechargeCount: 3, rechargeDaysAgo: 5, activityMinutesAgo: 42, planHistory: [{ plan: 'Lexus', action: 'Plan started', daysAgo: 142, amount: 0 }], manualCredit: 0, refund: 0 },
    { id: 'portfolio-05', companyName: 'BrickLeaf Realty', segment: 'Small / Low Usage', plan: 'Lexus', status: 'active', ageDays: 96, users: 4, callsPerDay: 2.8, connectionRate: 0.64, leadRate: 0.23, qualificationRate: 0.45, avgMinutes: 4.8, rupeesPerMinute: 8, wallet: 8210, rechargeCount: 2, rechargeDaysAgo: 18, activityMinutesAgo: 88, planHistory: [{ plan: 'Lexus', action: 'Plan started', daysAgo: 96, amount: 0 }], manualCredit: 0, refund: 0 },
    { id: 'portfolio-06', companyName: 'MeadowKey Properties', segment: 'Small / Low Usage', plan: 'Lexus', status: 'inactive', ageDays: 214, users: 6, callsPerDay: 0.55, connectionRate: 0.42, leadRate: 0.12, qualificationRate: 0.24, avgMinutes: 3.5, rupeesPerMinute: 9, wallet: 190, rechargeCount: 1, rechargeDaysAgo: 61, activityMinutesAgo: 3260, planHistory: [{ plan: 'Lexus', action: 'Plan started', daysAgo: 214, amount: 0 }], manualCredit: 0, refund: 0 },
    { id: 'portfolio-07', companyName: 'PropAxis Developers', segment: 'Growing', plan: 'Prestige', status: 'active', ageDays: 185, users: 16, callsPerDay: 7.4, connectionRate: 0.68, leadRate: 0.27, qualificationRate: 0.48, avgMinutes: 5.1, rupeesPerMinute: 9, wallet: 6840, rechargeCount: 6, rechargeDaysAgo: 3, activityMinutesAgo: 9, planHistory: [{ plan: 'Lexus', action: 'Plan started', daysAgo: 185, amount: 0 }, { plan: 'Prestige', action: 'Upgraded to Prestige', daysAgo: 38, amount: 6500 }], manualCredit: 0, refund: 0 },
    { id: 'portfolio-08', companyName: 'Nestora Realty', segment: 'Growing', plan: 'Lexus', status: 'active', ageDays: 126, users: 11, callsPerDay: 5.2, connectionRate: 0.61, leadRate: 0.24, qualificationRate: 0.41, avgMinutes: 4.7, rupeesPerMinute: 8, wallet: 960, rechargeCount: 4, rechargeDaysAgo: 2, activityMinutesAgo: 16, planHistory: [{ plan: 'Lexus', action: 'Plan started', daysAgo: 126, amount: 0 }], manualCredit: 1600, refund: 0 },
    { id: 'portfolio-09', companyName: 'Skyline Infraworks', segment: 'Growing', plan: 'Prestige', status: 'active', ageDays: 238, users: 23, callsPerDay: 10.5, connectionRate: 0.72, leadRate: 0.3, qualificationRate: 0.52, avgMinutes: 5.6, rupeesPerMinute: 10, wallet: 14200, rechargeCount: 8, rechargeDaysAgo: 8, activityMinutesAgo: 25, planHistory: [{ plan: 'Lexus', action: 'Plan started', daysAgo: 238, amount: 0 }, { plan: 'Prestige', action: 'Upgraded to Prestige', daysAgo: 74, amount: 6500 }], manualCredit: 0, refund: 0 },
    { id: 'portfolio-10', companyName: 'Saffron Gate Realty', segment: 'Growing', plan: 'Lexus', status: 'active', ageDays: 167, users: 9, callsPerDay: 4.1, connectionRate: 0.56, leadRate: 0.18, qualificationRate: 0.31, avgMinutes: 4.4, rupeesPerMinute: 9, wallet: 4280, rechargeCount: 5, rechargeDaysAgo: 11, activityMinutesAgo: 61, planHistory: [{ plan: 'Lexus', action: 'Plan started', daysAgo: 167, amount: 0 }], manualCredit: 0, refund: 900 },
    { id: 'portfolio-11', companyName: 'Capital Canopy Estates', segment: 'Established', plan: 'Prestige', status: 'active', ageDays: 394, users: 31, callsPerDay: 17.6, connectionRate: 0.74, leadRate: 0.31, qualificationRate: 0.55, avgMinutes: 5.8, rupeesPerMinute: 10, wallet: 28600, rechargeCount: 13, rechargeDaysAgo: 4, activityMinutesAgo: 5, planHistory: [{ plan: 'Lexus', action: 'Plan started', daysAgo: 394, amount: 0 }, { plan: 'Prestige', action: 'Upgraded to Prestige', daysAgo: 208, amount: 6500 }], manualCredit: 0, refund: 0 },
    { id: 'portfolio-12', companyName: 'Ivory Courtyard Realty', segment: 'Established', plan: 'Prestige', status: 'active', ageDays: 326, users: 25, callsPerDay: 14.2, connectionRate: 0.7, leadRate: 0.28, qualificationRate: 0.46, avgMinutes: 5.2, rupeesPerMinute: 10, wallet: 1150, rechargeCount: 10, rechargeDaysAgo: 1, activityMinutesAgo: 33, planHistory: [{ plan: 'Lexus', action: 'Plan started', daysAgo: 326, amount: 0 }, { plan: 'Prestige', action: 'Upgraded to Prestige', daysAgo: 151, amount: 6500 }], manualCredit: 0, refund: 0 },
    { id: 'portfolio-13', companyName: 'NorthGate Habitat', segment: 'Established', plan: 'Prestige', status: 'active', ageDays: 281, users: 19, callsPerDay: 12.3, connectionRate: 0.66, leadRate: 0.25, qualificationRate: 0.43, avgMinutes: 4.9, rupeesPerMinute: 9, wallet: 7350, rechargeCount: 9, rechargeDaysAgo: 13, activityMinutesAgo: 174, planHistory: [{ plan: 'Lexus', action: 'Plan started', daysAgo: 281, amount: 0 }, { plan: 'Prestige', action: 'Upgraded to Prestige', daysAgo: 108, amount: 6500 }], manualCredit: 0, refund: 0 },
    { id: 'portfolio-14', companyName: 'IndigoRise Developers', segment: 'Enterprise', plan: 'Enterprise', status: 'active', ageDays: 421, users: 84, callsPerDay: 39, connectionRate: 0.79, leadRate: 0.34, qualificationRate: 0.61, avgMinutes: 6.2, rupeesPerMinute: 12, wallet: 82600, rechargeCount: 18, rechargeDaysAgo: 2, activityMinutesAgo: 4, planHistory: [{ plan: 'Lexus', action: 'Plan started', daysAgo: 421, amount: 0 }, { plan: 'Prestige', action: 'Upgraded to Prestige', daysAgo: 286, amount: 6500 }, { plan: 'Enterprise', action: 'Upgraded to Enterprise', daysAgo: 97, amount: 24000 }], manualCredit: 0, refund: 0 },
    { id: 'portfolio-15', companyName: 'Royal Banyan Properties', segment: 'Enterprise', plan: 'Enterprise', status: 'active', ageDays: 365, users: 62, callsPerDay: 31, connectionRate: 0.76, leadRate: 0.32, qualificationRate: 0.58, avgMinutes: 5.9, rupeesPerMinute: 12, wallet: 12700, rechargeCount: 16, rechargeDaysAgo: 7, activityMinutesAgo: 22, planHistory: [{ plan: 'Lexus', action: 'Plan started', daysAgo: 365, amount: 0 }, { plan: 'Prestige', action: 'Upgraded to Prestige', daysAgo: 241, amount: 6500 }, { plan: 'Enterprise', action: 'Upgraded to Enterprise', daysAgo: 62, amount: 24000 }], manualCredit: 0, refund: 0 },
    { id: 'portfolio-16', companyName: 'BluePeak Habitat', segment: 'At Risk', plan: 'Prestige', status: 'at-risk', ageDays: 253, users: 13, callsPerDay: 5.7, connectionRate: 0.49, leadRate: 0.16, qualificationRate: 0.28, avgMinutes: 4.3, rupeesPerMinute: 10, wallet: 340, rechargeCount: 6, rechargeDaysAgo: 48, activityMinutesAgo: 2980, planHistory: [{ plan: 'Lexus', action: 'Plan started', daysAgo: 253, amount: 0 }, { plan: 'Prestige', action: 'Upgraded to Prestige', daysAgo: 142, amount: 6500 }], manualCredit: 0, refund: 0 },
  ];

  function hash(value) {
    let result = SEED;
    for (let index = 0; index < value.length; index += 1) {
      result = Math.imul(result ^ value.charCodeAt(index), 16777619);
    }
    return result >>> 0;
  }

  function unit(seed, key) {
    return hash(seed + ':' + key) / 0xffffffff;
  }

  function relativeDate(now, daysAgo, minutesAgo = 0) {
    return new Date(now.getTime() - (daysAgo * DAY) - (minutesAgo * 60 * 1000)).toISOString();
  }

  function roundMoney(value) {
    return Math.max(0, Math.round(value));
  }

  function buildCustomer(spec, now) {
    const profileFactor = 0.9 + unit(spec.id, 'profile') * 0.2;
    const currentDay = now.getDate();
    const daysSinceMonthStart = currentDay - 1;
    const daysSinceCreated = Math.max(1, spec.ageDays);
    const mtdDays = Math.min(daysSinceCreated, Math.max(1, daysSinceMonthStart + 1));
    const totalCalls = Math.max(0, Math.floor(spec.callsPerDay * daysSinceCreated * profileFactor));
    const mtdCalls = Math.min(totalCalls, Math.floor(spec.callsPerDay * mtdDays * profileFactor));
    const connectedCalls = Math.min(totalCalls, Math.round(totalCalls * spec.connectionRate));
    const mtdConnectedCalls = Math.min(mtdCalls, Math.round(mtdCalls * spec.connectionRate));
    const avgMinutes = spec.avgMinutes * (0.92 + unit(spec.id, 'duration') * 0.16);
    const totalMinutes = Math.round(connectedCalls * avgMinutes);
    const mtdMinutes = Math.round(mtdConnectedCalls * avgMinutes);
    const leads = Math.min(connectedCalls, Math.round(connectedCalls * spec.leadRate));
    const qualifiedLeads = Math.min(leads, Math.round(leads * spec.qualificationRate));
    const mtdLeads = Math.min(mtdConnectedCalls, Math.round(mtdConnectedCalls * spec.leadRate));
    const mtdQualifiedLeads = Math.min(mtdLeads, Math.round(mtdLeads * spec.qualificationRate));
    const usageSpend = roundMoney(totalMinutes * spec.rupeesPerMinute);
    const currentMonthSpend = roundMoney(mtdMinutes * spec.rupeesPerMinute);
    const upgradeFees = spec.planHistory.reduce((sum, item) => sum + (item.amount || 0), 0);
    const lifetimeSpend = usageSpend + upgradeFees;
    const manualCredit = spec.manualCredit || 0;
    const refund = spec.refund || 0;
    const rechargeTotal = Math.max(0, lifetimeSpend + spec.wallet - manualCredit - refund);
    const initials = spec.companyName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    const createdAt = relativeDate(now, daysSinceCreated);
    const transactions = [];

    if (spec.rechargeCount > 0) {
      const baseAmount = Math.floor(rechargeTotal / spec.rechargeCount);
      let remainder = rechargeTotal - (baseAmount * spec.rechargeCount);
      for (let index = 0; index < spec.rechargeCount; index += 1) {
        const isLatest = index === spec.rechargeCount - 1;
        const daysAgo = isLatest
          ? Math.min(spec.rechargeDaysAgo, daysSinceCreated)
          : Math.min(daysSinceCreated, spec.rechargeDaysAgo + ((spec.rechargeCount - index - 1) * 19));
        const amount = baseAmount + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder -= 1;
        transactions.push({ id: spec.id + '-recharge-' + index, type: 'Recharge', amount, occurredAt: relativeDate(now, daysAgo, (hash(spec.id + index) % 720)) });
      }
    }

    if (currentMonthSpend > 0) {
      transactions.push({ id: spec.id + '-usage-mtd', type: 'Call Usage', amount: -currentMonthSpend, occurredAt: relativeDate(now, Math.min(daysSinceCreated, Math.max(0, daysSinceMonthStart)), hash(spec.id + 'mtd') % 360) });
    }
    const priorUsageSpend = Math.max(0, usageSpend - currentMonthSpend);
    if (priorUsageSpend > 0) {
      transactions.push({ id: spec.id + '-usage-prior', type: 'Call Usage', amount: -priorUsageSpend, occurredAt: relativeDate(now, Math.min(daysSinceCreated, Math.max(1, daysSinceMonthStart + 3))) });
    }
    spec.planHistory.filter((item) => item.amount > 0).forEach((item, index) => {
      transactions.push({ id: spec.id + '-upgrade-' + index, type: 'Plan Upgrade', amount: -item.amount, occurredAt: relativeDate(now, Math.min(daysSinceCreated, item.daysAgo)) });
    });
    if (manualCredit > 0) transactions.push({ id: spec.id + '-credit', type: 'Manual Credit', amount: manualCredit, occurredAt: relativeDate(now, Math.min(daysSinceCreated, 24), 85) });
    if (refund > 0) transactions.push({ id: spec.id + '-refund', type: 'Refund', amount: refund, occurredAt: relativeDate(now, Math.min(daysSinceCreated, 13), 210) });
    transactions.sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt));

    const planHistory = spec.planHistory.map((item) => ({
      plan: item.plan,
      action: item.action,
      amount: item.amount || 0,
      changedAt: relativeDate(now, Math.min(daysSinceCreated, item.daysAgo)),
    }));
    const activityHistory = [
      { type: 'usage', message: spec.status === 'trial' || spec.status === 'new' ? 'Started exploring AI calling' : 'Completed ' + Math.min(totalCalls, 42) + ' AI calls', occurredAt: relativeDate(now, 0, spec.activityMinutesAgo) },
      { type: 'leads', message: 'Generated ' + qualifiedLeads + ' qualified leads', occurredAt: relativeDate(now, 0, spec.activityMinutesAgo + 37) },
    ];
    if (spec.rechargeCount > 0) {
      const latestRecharge = transactions.find((transaction) => transaction.type === 'Recharge');
      activityHistory.push({ type: 'wallet', message: 'Recharged ₹' + (latestRecharge?.amount || 0).toLocaleString('en-IN'), occurredAt: latestRecharge?.occurredAt || relativeDate(now, spec.rechargeDaysAgo || 1) });
    }
    const latestUpgrade = [...planHistory].reverse().find((item) => item.amount > 0);
    if (latestUpgrade) activityHistory.push({ type: 'plan', message: 'Upgraded to ' + latestUpgrade.plan, occurredAt: latestUpgrade.changedAt });
    activityHistory.sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt));

    return {
      id: spec.id,
      companyName: spec.companyName,
      initials,
      segment: spec.segment,
      plan: spec.plan,
      status: spec.status,
      createdAt,
      users: spec.users,
      walletBalance: spec.wallet,
        lowBalance: spec.wallet > 0 && spec.wallet <= 2500,
      totalCalls,
      connectedCalls,
      totalMinutes,
      leads,
      qualifiedLeads,
      conversionRate: leads ? (qualifiedLeads / leads) * 100 : 0,
      lifetimeSpend,
      currentMonthSpend,
      lastActivity: activityHistory[0]?.occurredAt || relativeDate(now, 0, spec.activityMinutesAgo),
      lastRecharge: spec.rechargeCount > 0 ? relativeDate(now, Math.min(spec.rechargeDaysAgo, daysSinceCreated)) : null,
      rechargeCount: spec.rechargeCount,
      planHistory,
      transactions,
      activityHistory,
      mtdQualifiedLeads,
      mtdMinutes,
    };
  }

  function getSnapshot(now = new Date()) {
    const safeNow = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
    const customers = SPECS.map((spec) => buildCustomer(spec, safeNow));
    const trendStart = new Date(safeNow);
    trendStart.setHours(0, 0, 0, 0);
    trendStart.setDate(trendStart.getDate() - 6);
    const dailyTrend = Array.from({ length: 7 }, (_unused, index) => {
      const date = new Date(trendStart);
      date.setDate(trendStart.getDate() + index);
      const key = date.toISOString().slice(0, 10);
      const totals = customers.reduce((sum, customer) => {
        const tenureDays = Math.max(1, Math.floor((safeNow.getTime() - new Date(customer.createdAt).getTime()) / DAY));
        const baseCalls = customer.totalCalls / tenureDays;
        const calls = Math.max(0, Math.round(baseCalls * (0.68 + unit(customer.id, key) * 0.64)));
        const connectionRate = customer.totalCalls ? customer.connectedCalls / customer.totalCalls : 0;
        const connectedCalls = Math.min(calls, Math.round(calls * connectionRate));
        const avgMinutes = customer.connectedCalls ? customer.totalMinutes / customer.connectedCalls : 0;
        const minutes = Math.round(connectedCalls * avgMinutes);
        const leadsPerCall = customer.connectedCalls ? customer.leads / customer.connectedCalls : 0;
        const qualificationRate = customer.leads ? customer.qualifiedLeads / customer.leads : 0;
        const qualifiedLeads = Math.round(connectedCalls * leadsPerCall * qualificationRate);
        const rupeesPerMinute = customer.mtdMinutes ? customer.currentMonthSpend / customer.mtdMinutes : 0;
        return {
          calls: sum.calls + calls,
          minutes: sum.minutes + minutes,
          qualifiedLeads: sum.qualifiedLeads + qualifiedLeads,
          walletConsumption: sum.walletConsumption + Math.round(minutes * rupeesPerMinute),
        };
      }, { calls: 0, minutes: 0, qualifiedLeads: 0, walletConsumption: 0 });
      return { date: key, ...totals };
    });
    const activities = customers.flatMap((customer) => customer.activityHistory.map((activity, index) => ({
      id: customer.id + '-activity-' + index,
      customerId: customer.id,
      companyName: customer.companyName,
      ...activity,
    }))).sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt));
    return { generatedAt: safeNow.toISOString(), customers, dailyTrend, activities };
  }

  return { getSnapshot };
})();