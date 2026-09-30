# Kiểm thử FlowPilot

Ngày 30/09/2026: `backend npm run build`, `backend npm run test:integration` và `frontend npm run build` đều thành công. Bộ tích hợp có **54 kiểm tra** trên một database PostgreSQL tạm, tự xóa khi hoàn tất. Database demo trong `flowpilot-company_postgres_data` không bị tác động.
`npm audit --omit=dev` và bước cài dependency trong Docker báo **0 lỗ hổng** ở bộ phiên bản đã khóa.

Các luồng đã kiểm tra: CEO/CDO không tạo mẫu; nhân viên có đồng thời quyền gửi request và tạo mẫu; nhân viên gửi mẫu, CDO trả bổ sung hoặc duyệt; mẫu chờ duyệt không sửa được; một mẫu đã duyệt tạo yêu cầu, trưởng phòng duyệt từ team trực thuộc; tài khoản tự đăng ký phải được phân công, cấp vai trò rồi kích hoạt; tạo phòng ban/team đúng cấp; Prisma Client đọc/tạo tài khoản và đọc mẫu.

Chạy lại:

```powershell
cd C:\Users\xiaomi\Study\Uni\Y4\TLCN\PrjectDemo\backend
npm run prisma:generate
npm run build
npm run test:integration
```

Prisma Studio chạy với `npm run prisma:studio`, mở `http://localhost:5555`. Nó cho xem và chỉnh bản ghi trực tiếp nên không thay thế kiểm thử qua API/UI.
