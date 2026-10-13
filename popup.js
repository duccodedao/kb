document.getElementById('btn-toggle-ui').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_HIS_EXAM_MODAL" }).catch((err) => {
            console.log("Không thể gửi thông điệp tới trang:", err);
            alert("Vui lòng mở trang Khám bệnh của HIS VNPT trước khi sử dụng!");
        });
    }
});