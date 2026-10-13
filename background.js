chrome.action.onClicked.addListener((tab) => {
    if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_HIS_EXAM_MODAL" }).catch((err) => {
            console.log("Nội dung trang chưa sẵn sàng:", err);
        });
    }
});