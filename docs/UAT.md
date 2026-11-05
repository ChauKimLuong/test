# Nghiệm thu nghiệp vụ — chờ sinh viên thực hiện

Bản code đã kiểm thử tự động theo [TESTING.md](TESTING.md). Thử [DEMO.md](DEMO.md), điền actual/bằng chứng; không có UAT giả lập.

| Nội dung | Expected | Actual / bằng chứng | Trạng thái |
|---|---|---|---|
| Cấu hình/lưu/publish | Nháp không đổi published; version tăng | Chưa thực hiện | Chờ |
| Nhánh 5/15 triệu | Linh hoặc Linh → CDO+CEO | Chưa thực hiện | Chờ |
| ALL | Đủ tất cả, một từ chối dừng | Chưa thực hiện | Chờ |
| ANY | Một đồng ý đủ, task dư hủy | Chưa thực hiện | Chờ |
| Version | Đơn cũ v1, mới v2 | Chưa thực hiện | Chờ |
| Bổ sung | Cùng mã, round mới, lịch sử giữ | Chưa thực hiện | Chờ |
| Quyền | Không tự duyệt/duyệt thay | Chưa thực hiện | Chờ |
| Bàn phím/390px/dialog | Hành động, label/focus đầy đủ | Chưa thực hiện | Chờ |
| A4 dài | Không mất dữ liệu, có nhiều người duyệt | Chưa thực hiện | Chờ |
| Máy bạn clone | start.ps1 chạy theo README | Chưa thực hiện | Chờ |

Điền ngày, browser/viewport, người thực hiện, commit, actual và góp ý giảng viên sau khi thử. Kết luận Đạt/Chưa đạt phải có bằng chứng.


## Bổ sung UAT vận hành CR-02

| Ca | Thao tác | Kỳ vọng | Actual |
|---|---|---|---|
| SLA-UI | Bật hạn 1 phút, nhắc trước 1 phút, Huy gửi | Có hạn/nhắc nội bộ, sau hạn target hợp lệ có task; không tự đồng ý | Chưa thực hiện |
| DEL-UI | Linh lập lịch CDO thay, thu hồi lịch | Có task CDO; task đã chuyển không tự hồi; đơn sau thu hồi giao Linh | Chưa thực hiện |
| TRANSFER-UI | Linh chuyển task; CDO quyết định trong ALL/ANY | Hiện người gốc/người thay/lý do; kết thúc đúng | Chưa thực hiện |
| FILE-UI | Lưu nháp, upload v1, trả bổ sung, upload v2/gửi vòng 2 | Download đúng tên; thấy v1 vòng 1/v2 vòng 2; có archive rõ nghĩa | Chưa thực hiện |
| CHAT-UI | Chief và sender trao đổi | Tên/thời điểm, thông báo, không thay quyết định | Chưa thực hiện |
| METRIC-UI | CDO/Hoàng mở báo cáo, lọc ngày, click hồ sơ | Mẫu số/thời gian rõ, scope đúng, link hoạt động | Chưa thực hiện |
| A11Y-OPS | Tab/input/file/select và mobile bốn màn hình mới | Focus rõ, label đầy đủ, không overflow ngoài bảng có scroll | Chưa thực hiện |


## UAT CR-04 — flow editor

| Ca | Kỳ vọng | Actual |
|---|---|---|
| Chọn node và sửa | Inspector đúng bước, canvas cập nhật tên/selectors/when/SLA | Chưa thực hiện trên browser |
| Thêm/xóa/reorder | Topology cập nhật, không xóa hết bước, backend kiểm tra first step | Chưa thực hiện trên browser |
| Flow/list/undo/redo | Dùng cùng definition, không mất nháp, cảnh báo rời trang | Chưa thực hiện trên browser |
| Drag/zoom/reset/minimap | Layout thao tác được, local theo assignment/workflow, không đổi business order | Chưa thực hiện trên browser |
| Mô phỏng 3/35 triệu | Bypass, group ALL và người được resolve thể hiện đúng | Projection test đạt; thao tác UI chưa thực hiện |
| Save/publish/version | Revision và pin version giữ cơ chế cũ | Chưa thực hiện từ UI mới |
| Enter/dropdown/focus/mobile/fullscreen | Có cách chọn bước bằng bàn phím, panel đọc được, Esc thoát | Chưa thực hiện trên browser |
