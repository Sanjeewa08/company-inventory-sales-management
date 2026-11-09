import type { RequestHandler } from "express";
import type {
  BranchComparisonQuery,
  OutstandingPaymentsQuery,
  SalesReportQuery,
  StockValuationQuery,
  TopProductsQuery,
} from "./reports.schema";
import {
  getBranchComparisonReport,
  getOutstandingPaymentsReport,
  getSalesReport,
  getStockValuationReport,
  getTopProductsReport,
} from "./reports.service";

export const getSalesReportController: RequestHandler = async (
  _request,
  response,
) => {
  const query = response.locals.validated.query as SalesReportQuery;
  response.status(200).json({ sales: await getSalesReport(query) });
};

export const getStockValuationReportController: RequestHandler = async (
  _request,
  response,
) => {
  const query = response.locals.validated.query as StockValuationQuery;
  response
    .status(200)
    .json({ stockValuation: await getStockValuationReport(query) });
};

export const getTopProductsReportController: RequestHandler = async (
  _request,
  response,
) => {
  const query = response.locals.validated.query as TopProductsQuery;
  response.status(200).json({ products: await getTopProductsReport(query) });
};

export const getBranchComparisonReportController: RequestHandler = async (
  _request,
  response,
) => {
  const query = response.locals.validated.query as BranchComparisonQuery;
  response
    .status(200)
    .json({ branches: await getBranchComparisonReport(query) });
};

export const getOutstandingPaymentsReportController: RequestHandler = async (
  _request,
  response,
) => {
  const query = response.locals.validated.query as OutstandingPaymentsQuery;
  response
    .status(200)
    .json({ invoices: await getOutstandingPaymentsReport(query) });
};
