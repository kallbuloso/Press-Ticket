import { Request, Response } from "express";
import formatBody from "../helpers/Mustache";
import { getIO } from "../libs/socket";
import ShowQueueService from "../services/QueueService/ShowQueueService";
import CheckOpenTicketsService from "../services/TicketServices/CheckOpenTicketsService";
import CreateTicketService from "../services/TicketServices/CreateTicketService";
import DeleteTicketService from "../services/TicketServices/DeleteTicketService";
import ListTicketsService from "../services/TicketServices/ListTicketsService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  status: string;
  date: string;
  showAll: string;
  withUnreadMessages: string;
  queueIds: string;
};

interface TicketData {
  contactId: number;
  status: string;
  queueId: number;
  userId: number;
  transf: boolean;
}

export const index = async (req: Request, res: Response): Promise<Response> => {
  const {
    pageNumber,
    status,
    date,
    searchParam,
    showAll,
    queueIds: queueIdsStringified,
    withUnreadMessages
  } = req.query as IndexQuery;

  const userId = req.user.id;

  let queueIds: number[] = [];

  if (queueIdsStringified) {
    queueIds = JSON.parse(queueIdsStringified);
  }

  const { tickets, count, hasMore } = await ListTicketsService({
    searchParam,
    pageNumber,
    status,
    date,
    showAll,
    userId,
    queueIds,
    withUnreadMessages
  });

  return res.status(200).json({ tickets, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { contactId, status, userId, queueId }: TicketData = req.body;

  const ticket = await CreateTicketService({
    contactId,
    status,
    userId,
    queueId
  });

  const io = getIO();
  io.to(ticket.status).emit("ticket", {
    action: "update",
    ticket
  });

  return res.status(200).json(ticket);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;

  const contact = await ShowTicketService(ticketId);

  return res.status(200).json(contact);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const ticketData: TicketData = req.body;

  const { ticket } = await UpdateTicketService({
    ticketData,
    ticketId
  });

  if (ticketData.transf) {
    const { greetingMessage } = await ShowQueueService(ticketData.queueId);
    if (greetingMessage) {
      const msgtxt = formatBody(`\u200e${greetingMessage}`);
      await SendWhatsAppMessage({ body: msgtxt, ticket });
    }
  }

  if (ticket.status === "closed" && ticket.isGroup === false) {
    const whatsapp = await ShowWhatsAppService(ticket.whatsappId);

    const { farewellMessage } = whatsapp;

    if (farewellMessage) {
      await SendWhatsAppMessage({
        body: formatBody(`\u200e${farewellMessage}`, ticket),
        ticket
      });
    }
  }

  return res.status(200).json(ticket);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;

  const ticket = await DeleteTicketService(ticketId);

  const io = getIO();
  io.to(ticket.status)
    .to(ticketId)
    .to("notification")
    .emit("ticket", {
      action: "delete",
      ticketId: +ticketId
    });

  return res.status(200).json({ message: "ticket deleted" });
};

export const checkOpenTickets = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { contactId } = req.params;

  try {
    const contactIdNumber = parseInt(contactId, 10);

    if (Number.isNaN(contactIdNumber)) {
      return res.status(400).json({ error: "Invalid contactId" });
    }

    const openTicket = await CheckOpenTicketsService(contactIdNumber);

    if (openTicket) {
      return res.status(200).json({
        hasOpenTicket: true,
        ticket: {
          id: openTicket.id,
          status: openTicket.status,
          user: openTicket.user
            ? {
              id: openTicket.user.id,
              name: openTicket.user.name
            }
            : null,
        },
      });
    }

    return res.status(200).json({ hasOpenTicket: false });
  } catch (err) {
    console.error("Erro ao verificar tickets abertos:", err.message);
    return res
      .status(500)
      .json({ error: "Erro ao verificar tickets abertos." });
  }
};