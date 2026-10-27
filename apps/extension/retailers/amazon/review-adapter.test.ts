import {expect,it,vi} from "vitest";
vi.mock("@/background/order-review",()=>({reviewSelectedOrder:vi.fn(async()=>({items:[],totalCents:0}))}));
import {canadianReviewAdapter} from "./review-adapter";
import {reviewSelectedOrder} from "@/background/order-review";
it("registers automatic review without a one/two-item branch",()=>{expect(canadianReviewAdapter.id).toBe("amazon-ca");expect(canadianReviewAdapter.review).toBe(reviewSelectedOrder);});
