/**
 * Comprehensive Billing Dashboard Functions
 * These functions populate the subscription management UI
 */

// Load complete billing dashboard when settings section is opened
async function loadBillingDashboard() {

    try {
        // Load all dashboard sections in parallel
        await Promise.all([
            loadSubscriptionStatusCard(),
            loadUsageMetersCard(),
            loadPaymentHistoryCard()
        ]);

    } catch (error) {
    }
}

// Load subscription status card
async function loadSubscriptionStatusCard() {
    const statusCard = document.getElementById('subscriptionStatusCard');
    if (!statusCard) return;

    try {
        const response = await fetch(`${API_GATEWAY_URL}/subscription/status`, {
            headers: {
                'Authorization': currentAuthToken
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch subscription status');
        }

        const data = await response.json();
        const subscription = data.subscription;

        if (!subscription || subscription.subscriptionStatus === 'none') {
            statusCard.innerHTML = `
                <div class="upgrade-prompt">
                    <div class="upgrade-prompt-text">
                        ⚠️ אין מנוי פעיל לחברה
                    </div>
                    <p style="color: #666; margin: 10px 0;">
                        הירשם למנוי כדי להזמין משתמשים, ליצור פרויקטים ולנהל הוצאות
                    </p>
                    <button class="add-project-button" onclick="showSubscriptionModal()">
                        הירשם למנוי עכשיו
                    </button>
                </div>
            `;
            return;
        }

        // Plan names in Hebrew
        const planNames = {
            'STARTER': 'Starter',
            'PROFESSIONAL': 'Professional',
            'ENTERPRISE': 'Enterprise'
        };

        const planPrices = {
            'STARTER': 29,
            'PROFESSIONAL': 79,
            'ENTERPRISE': 199
        };

        const isActive = subscription.subscriptionStatus === 'active';
        const planName = planNames[subscription.currentPlan] || subscription.currentPlan;
        const planPrice = planPrices[subscription.currentPlan] || 0;

        statusCard.innerHTML = `
            <div class="plan-header">
                <div>
                    <div class="plan-name">תוכנית ${planName}</div>
                    <div class="plan-price">$${planPrice}/חודש</div>
                </div>
                <div class="subscription-badge ${isActive ? 'active' : 'expired'}">
                    ${isActive ? '✓ פעיל' : '✗ לא פעיל'}
                </div>
            </div>

            <div class="plan-details">
                <div class="plan-detail-item">
                    <div class="plan-detail-label">מצב מנוי</div>
                    <div class="plan-detail-value">${getSubscriptionStatusText(subscription.subscriptionStatus)}</div>
                </div>

                ${subscription.nextBillingDate ? `
                <div class="plan-detail-item">
                    <div class="plan-detail-label">חיוב הבא</div>
                    <div class="plan-detail-value">${new Date(subscription.nextBillingDate).toLocaleDateString('he-IL')}</div>
                </div>
                ` : ''}

                ${subscription.paddleCustomerId ? `
                <div class="plan-detail-item">
                    <div class="plan-detail-label">מזהה לקוח</div>
                    <div class="plan-detail-value" style="font-size: 0.8rem;">${subscription.paddleCustomerId.substring(0, 16)}...</div>
                </div>
                ` : ''}
            </div>
        `;

    } catch (error) {
        statusCard.innerHTML = `
            <div style="color: #e53e3e; padding: 15px; text-align: center;">
                שגיאה בטעינת מצב המנוי
            </div>
        `;
    }
}

// Load usage meters card
async function loadUsageMetersCard() {
    const usageCard = document.getElementById('usageMetersCard');
    if (!usageCard) return;

    try {
        const response = await fetch(`${API_GATEWAY_URL}/subscription/usage`, {
            headers: {
                'Authorization': currentAuthToken
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch usage data');
        }

        const data = await response.json();
        const usage = data.usage;
        const limits = data.limits;
        const utilization = data.utilizationPercent;

        if (!limits) {
            usageCard.innerHTML = `
                <div class="no-payments">אין נתוני שימוש זמינים</div>
            `;
            return;
        }

        usageCard.innerHTML = `
            <div class="usage-meter-container">
                ${createUsageMeter('משתמשים', usage.users, limits.maxUsers, utilization?.users)}
                ${createUsageMeter('פרויקטים', usage.projects, limits.maxProjects, utilization?.projects)}
                ${createUsageMeter('הוצאות החודש', usage.expensesThisMonth, -1, 0)}
                ${createStorageMeter(usage.storageUsed, limits.storage, utilization?.storage)}
            </div>

            ${utilization && (utilization.users > 80 || utilization.projects > 80 || utilization.storage > 80) ? `
                <div class="upgrade-prompt">
                    <div class="upgrade-prompt-text">
                        ⚠️ אתם מתקרבים למגבלת התוכנית שלכם
                    </div>
                    <button class="add-project-button" onclick="showUpgradeModal()" style="margin-top: 10px;">
                        שדרגו עכשיו
                    </button>
                </div>
            ` : ''}
        `;

    } catch (error) {
        usageCard.innerHTML = `
            <div style="color: #e53e3e; padding: 15px; text-align: center;">
                שגיאה בטעינת נתוני שימוש
            </div>
        `;
    }
}

// Create usage meter HTML
function createUsageMeter(label, current, max, percent) {
    if (max === -1) {
        return `
            <div class="usage-meter">
                <div class="usage-label">
                    <span class="usage-label-name">${label}</span>
                    <span class="usage-unlimited">ללא הגבלה</span>
                </div>
                <div style="color: #718096; font-size: 0.9rem;">שימוש נוכחי: ${current}</div>
            </div>
        `;
    }

    const percentValue = percent || ((current / max) * 100);
    const width = Math.min(percentValue, 100);
    let fillClass = '';

    if (percentValue >= 90) fillClass = 'danger';
    else if (percentValue >= 75) fillClass = 'warning';

    return `
        <div class="usage-meter">
            <div class="usage-label">
                <span class="usage-label-name">${label}</span>
                <span class="usage-label-count">${current} / ${max}</span>
            </div>
            <div class="usage-bar">
                <div class="usage-fill ${fillClass}" style="width: ${width}%">
                    ${Math.round(percentValue)}%
                </div>
            </div>
        </div>
    `;
}

// Create storage meter HTML
function createStorageMeter(usedMB, maxMB, percent) {
    if (maxMB === -1) {
        return `
            <div class="usage-meter">
                <div class="usage-label">
                    <span class="usage-label-name">אחסון</span>
                    <span class="usage-unlimited">ללא הגבלה</span>
                </div>
                <div style="color: #718096; font-size: 0.9rem;">שימוש: ${formatStorage(usedMB)}</div>
            </div>
        `;
    }

    const percentValue = percent || ((usedMB / maxMB) * 100);
    const width = Math.min(percentValue, 100);
    let fillClass = '';

    if (percentValue >= 90) fillClass = 'danger';
    else if (percentValue >= 75) fillClass = 'warning';

    return `
        <div class="usage-meter">
            <div class="usage-label">
                <span class="usage-label-name">אחסון</span>
                <span class="usage-label-count">${formatStorage(usedMB)} / ${formatStorage(maxMB)}</span>
            </div>
            <div class="usage-bar">
                <div class="usage-fill ${fillClass}" style="width: ${width}%">
                    ${Math.round(percentValue)}%
                </div>
            </div>
        </div>
    `;
}

// Format storage size
function formatStorage(mb) {
    if (mb < 1024) return `${Math.round(mb)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
}

// Load payment history card
async function loadPaymentHistoryCard() {
    const historyCard = document.getElementById('paymentHistoryCard');
    if (!historyCard) return;

    try {
        // For now, show placeholder until payment history API is implemented
        // In production, you would fetch from: GET /api/paddle/payments?companyId=xxx

        historyCard.innerHTML = `
            <div class="no-payments">
                <p>אין היסטוריית תשלומים זמינה כרגע</p>
                <p style="font-size: 0.9rem; color: #a0aec0; margin-top: 10px;">
                    תשלומים יופיעו כאן לאחר החיוב הראשון
                </p>
            </div>
        `;

        // Example of how payment history would look:
        /*
        const payments = [
            { date: '2025-01-08', amount: 79, currency: 'USD', status: 'succeeded', method: 'Card' },
            { date: '2024-12-08', amount: 79, currency: 'USD', status: 'succeeded', method: 'Card' },
        ];

        historyCard.innerHTML = `
            <table class="payment-history-table">
                <thead>
                    <tr>
                        <th>תאריך</th>
                        <th>סכום</th>
                        <th>אמצעי תשלום</th>
                        <th>סטטוס</th>
                    </tr>
                </thead>
                <tbody>
                    ${payments.map(payment => `
                        <tr>
                            <td>${new Date(payment.date).toLocaleDateString('he-IL')}</td>
                            <td>$${payment.amount} ${payment.currency}</td>
                            <td>${payment.method}</td>
                            <td><span class="payment-status ${payment.status}">${getPaymentStatusText(payment.status)}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        */

    } catch (error) {
        historyCard.innerHTML = `
            <div style="color: #e53e3e; padding: 15px; text-align: center;">
                שגיאה בטעינת היסטוריית תשלומים
            </div>
        `;
    }
}

// Get subscription status text in Hebrew
function getSubscriptionStatusText(status) {
    const statusTexts = {
        'active': 'פעיל',
        'trialing': 'תקופת נסיון',
        'past_due': 'חוב פתוח',
        'canceled': 'בוטל',
        'none': 'אין מנוי'
    };
    return statusTexts[status] || status;
}

// Get payment status text in Hebrew
function getPaymentStatusText(status) {
    const statusTexts = {
        'succeeded': 'הצליח',
        'failed': 'נכשל',
        'refunded': 'הוחזר'
    };
    return statusTexts[status] || status;
}

// Manage billing info (redirect to Paddle portal)
async function manageBillingInfo() {
    try {
        alert('מעביר לעמוד ניהול פרטי תשלום...');
        // In production, you would get the Paddle customer portal URL from your backend
        // window.open(customerPortalUrl, '_blank');
    } catch (error) {
        alert('שגיאה בפתיחת דף ניהול התשלום');
    }
}

// Confirm subscription cancellation
async function confirmCancelSubscription() {
    const confirmed = confirm(
        'האם אתה בטוח שברצונך לבטל את המנוי?\n\n' +
        'הגישה תימשך עד סוף תקופת החיוב הנוכחית.\n' +
        'לאחר מכן לא תוכל להזמין משתמשים או ליצור פרויקטים חדשים.'
    );

    if (!confirmed) return;

    try {
        const response = await fetch(`${API_GATEWAY_URL}/subscription/cancel`, {
            method: 'DELETE',
            headers: {
                'Authorization': currentAuthToken,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to cancel subscription');
        }

        const data = await response.json();
        alert(data.message || 'המנוי בוטל בהצלחה');

        // Reload dashboard
        await loadBillingDashboard();

    } catch (error) {
        alert('שגיאה בביטול המנוי. אנא נסה שנית.');
    }
}

// Upgrade to plan (from upgrade modal)
async function upgradeToPlan(planId) {
    try {
        const response = await fetch(`${API_GATEWAY_URL}/subscription/upgrade`, {
            method: 'POST',
            headers: {
                'Authorization': currentAuthToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ newPlan: planId })
        });

        if (!response.ok) {
            throw new Error('Failed to upgrade subscription');
        }

        const data = await response.json();
        alert(data.message || 'המנוי שודרג בהצלחה!');

        // Close modal and reload dashboard
        closeSubscriptionModal();
        await loadBillingDashboard();

    } catch (error) {
        alert('שגיאה בשדרוג המנוי. אנא נסה שנית.');
    }
}

// Export functions to be available globally
if (typeof window !== 'undefined') {
    window.loadBillingDashboard = loadBillingDashboard;
    window.loadSubscriptionStatusCard = loadSubscriptionStatusCard;
    window.loadUsageMetersCard = loadUsageMetersCard;
    window.loadPaymentHistoryCard = loadPaymentHistoryCard;
    window.manageBillingInfo = manageBillingInfo;
    window.confirmCancelSubscription = confirmCancelSubscription;
    window.upgradeToPlan = upgradeToPlan;
}
