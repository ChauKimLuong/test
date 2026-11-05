Cập nhật quy trình nâng cấp 01/10/2026; xem [báo cáo thực hiện](IMPLEMENTATION_REPORT.md).

# Chức năng hiện tại của FlowPilot

Được cập nhật sau phản hồi phân quyền ngày 30/09/2026; bản trước đã được Astra 6 rà soát. Đây là phạm vi demo hiện có, không phải danh sách kế hoạch.

| Nhóm | Chức năng |
|---|---|
| Tài khoản | Tự đăng ký chờ CEO kích hoạt; đăng nhập, đăng xuất, đổi mật khẩu; chuyển phân công; phiên đăng nhập lưu PostgreSQL. |
| Tổng quan | Số lượng đơn, biểu đồ sáu tháng, tỷ lệ duyệt, thời gian xử lý trung bình, đơn gần đây, việc được giao. |
| Mẫu đơn | Thư viện, tìm kiếm/lọc, xem trước A4, nhân bản, kích hoạt/ngừng dùng. |
| Thiết kế mẫu | Bảy loại thành phần: văn bản ngắn/dài, số, ngày, danh sách chọn, xác nhận, tiêu đề nhóm; bắt buộc; một/hai cột; thêm/sửa/nhân bản/xóa/sắp xếp; hoàn tác/làm lại; in hoặc lưu PDF từ trình duyệt. |
| Thẩm định mẫu | Mọi thành viên tạo mẫu; nhân viên chọn cấp trên/lãnh đạo thẩm định. Người được giao có thể sửa mẫu trước khi duyệt. Lãnh đạo được cấp quyền ban hành trực tiếp; mẫu dùng chung được sửa thành phiên bản mới, đơn cũ giữ nội dung cũ. |
| Quy trình | Nhiều bước, điều kiện AND/OR theo dữ liệu, song song ALL/ANY, sáu loại selector; nháp/ban hành/version/history/restore, mô phỏng; BLOCKED/retry; đơn đang chạy pinned version. |
| Yêu cầu | Điền mẫu, nháp/gửi/hủy, trả bổ sung/sửa/gửi lại cùng mã và version; snapshot/diff/tiến trình/task theo vòng; nhân bản đơn bị từ chối thành đơn mới; tìm kiếm, lọc, phân trang, xuất CSV. |
| Phê duyệt | Người được giao duyệt hoặc từ chối, bắt buộc nêu lý do từ chối, cấm tự duyệt. |
| Tổ chức | Công ty, phòng ban, team, chức danh; tạo/sửa đơn vị và chức danh; kiểm tra quan hệ cấp trên và chu trình. |
| Nhân sự | Tạo tài khoản chờ, phân công và người quản lý; phân công chính/kiêm nhiệm/biệt phái; kết thúc phân công; kích hoạt/khóa tài khoản. |
| Phân quyền | Vai trò, phạm vi toàn tổ chức/đơn vị, thời hạn, cấp và thu hồi; API kiểm tra quyền ở máy chủ. |
| Kiểm soát | Nhật ký bất biến, lọc/phân trang/xuất CSV; thông báo, đánh dấu đã đọc; Docker Compose; Prisma Studio; kiểm thử tích hợp. |

## Điểm vào đúng cho hai thao tác

- **Tạo mẫu đơn mới:** nhân viên có quyền `FORM_CREATE` → menu **Tạo mẫu đơn mới** hoặc `/forms/new` → lưu nháp → chọn người thẩm định. Lãnh đạo có quyền ban hành có thể đưa mẫu vào dùng ngay.
- **Tạo yêu cầu:** nhân viên có quyền `REQUEST_CREATE` → menu **Tạo yêu cầu** hoặc `/requests/new` → chọn mẫu đang hoạt động đã được duyệt → điền và gửi.
- CEO/CDO được tạo mẫu, ban hành trực tiếp, sửa mẫu dùng chung và tạo yêu cầu. Quyền ban hành cho CTO hoặc lãnh đạo khác được cấp bằng vai trò `FORM_PUBLISHER`. Xem [ma trận quyền](PERMISSIONS.md).

## Kết quả rà soát Astra 6 và sửa chữa

- Đã sửa `/register` tự chuyển về đăng nhập khi mở trực tiếp và lỗi trùng email trả 500.
- Đã làm rõ lối vào tạo mẫu, phân biệt mẫu đơn với yêu cầu, và chỉ cho phép chọn mẫu đã duyệt khi tạo yêu cầu.
- Đã chặn mẫu chỉ có tiêu đề nhóm đi qua bước thẩm định.
- Đã chặn khóa/kết thúc phân công/thu hồi vai trò thẩm định khi còn mẫu được giao đang chờ.
- Đã hiển thị lịch sử thẩm định mẫu và gửi thông báo cho CDO/người tạo.
- Đã kiểm tra hiệu lực vai trò trước khi CEO kích hoạt tài khoản.

## Giới hạn hiện tại

- Chưa có chuyển giao mẫu chờ thẩm định sang CDO khác. Nên xử lý hàng chờ trước khi thay đổi CDO hoặc vai trò của họ.
- Đã bổ sung cảnh báo khi rời trang qua liên kết lúc chưa lưu ở trình thiết kế, soạn đơn và cấu hình workflow; UAT trực quan cần ghi actual.
- Bổ sung SLA/nhắc hạn/chuyển cấp, lịch ủy quyền/chuyển giao, tài liệu có version theo vòng/trao đổi và báo cáo điểm chậm. Xem [12 chức năng và cách hoạt động](WORKFLOW_GUIDE.md).
- Chưa có BPMN tổng quát hoặc nối đồ thị tùy ý, email/SMS, SSO, chữ ký số pháp lý, antivirus hoặc nhiều công ty trong cùng một hệ thống.
