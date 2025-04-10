import {
  Avatar,
  Button,
  IconButton,
  InputAdornment,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import {
  AddCircleOutline,
  Archive,
  DeleteForever,
  DeleteOutline,
  Edit,
  ImportContacts,
  Search,
  WhatsApp
} from "@material-ui/icons";
import React, { useContext, useEffect, useReducer, useState } from "react";
import { CSVLink } from "react-csv";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { Can } from "../../components/Can";
import ConfirmationModal from "../../components/ConfirmationModal/";
import ContactChannels from "../../components/ContactChannels";
import ContactModal from "../../components/ContactModal";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import NewTicketModalPageContact from "../../components/NewTicketModalPageContact";
import TableRowSkeleton from "../../components/TableRowSkeleton";
import TagsFilter from "../../components/TagsFilter";
import Title from "../../components/Title";
import { AuthContext } from "../../context/Auth/AuthContext";
import toastError from "../../errors/toastError";
import api from "../../services/api";
import openSocket from "../../services/socket-io";

const reducer = (state, action) => {
  if (action.type === "LOAD_CONTACTS") {
    const contacts = action.payload;
    const newContacts = [];

    contacts.forEach((contact) => {
      const contactIndex = state.findIndex((c) => c.id === contact.id);
      if (contactIndex !== -1) {
        state[contactIndex] = contact;
      } else {
        newContacts.push(contact);
      }
    });

    return [...state, ...newContacts];
  }

  if (action.type === "UPDATE_CONTACTS") {
    const contact = action.payload;
    const contactIndex = state.findIndex((c) => c.id === contact.id);

    if (contactIndex !== -1) {
      state[contactIndex] = contact;
      return [...state];
    } else {
      return [contact, ...state];
    }
  }

  if (action.type === "DELETE_CONTACT") {
    const contactId = action.payload;

    const contactIndex = state.findIndex((c) => c.id === contactId);
    if (contactIndex !== -1) {
      state.splice(contactIndex, 1);
    }
    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }
};

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(2),
    margin: theme.spacing(1),
    overflowY: "scroll",
    ...theme.scrollbarStyles,
  },
  csvbtn: {
    textDecoration: 'none'
  },
  avatar: {
    width: "50px",
    height: "50px",
    borderRadius: "25%"
  },
  buttonSize: {
    maxWidth: "36px",
    maxHeight: "36px",
    padding: theme.spacing(1),
  },
}));

const Contacts = () => {
  const classes = useStyles();
  const { t } = useTranslation();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [searchParam, setSearchParam] = useState("");
  const [contacts, dispatch] = useReducer(reducer, []);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [deletingContact, setDeletingContact] = useState(null);
  const [deletingAllContact, setDeletingAllContact] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [contactTicket, setContactTicket] = useState({});
  const [filteredTags, setFilteredTags] = useState([]);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [searchParam]);

  useEffect(() => {
    setLoading(true);

    const delayDebounceFn = setTimeout(() => {
      const fetchContacts = async () => {
        try {
          const { data } = await api.get("/contacts/", {
            params: {
              searchParam,
              pageNumber,
              tags: filteredTags.map(tag => tag.id).join(",")
            }
          });

          dispatch({ type: "LOAD_CONTACTS", payload: data.contacts });
          setHasMore(data.hasMore);
          setLoading(false);
        } catch (err) {
          toastError(err);
        }
      };

      fetchContacts();
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchParam, pageNumber, filteredTags]);

  useEffect(() => {
    const socket = openSocket();

    socket.on("contact", (data) => {
      if (data.action === "update" || data.action === "create") {
        dispatch({ type: "UPDATE_CONTACTS", payload: data.contact });
      }

      if (data.action === "delete") {
        dispatch({ type: "DELETE_CONTACT", payload: +data.contactId });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleTagFilter = (tags) => {
    setFilteredTags(tags);
    dispatch({ type: "RESET" }); // Resetar os contatos
    setPageNumber(1); // Reiniciar a busca da página 1
  };

  const handleSearch = (event) => {
    setSearchParam(event.target.value.toLowerCase());
  };

  const handleOpenContactModal = () => {
    setSelectedContactId(null);
    setContactModalOpen(true);
  };

  const handleCloseContactModal = () => {
    setSelectedContactId(null);
    setContactModalOpen(false);
  };

  const handleCloseOrOpenTicket = (ticket) => {
    setNewTicketModalOpen(false);
    if (ticket !== undefined && ticket.id !== undefined) {
      history.push(`/tickets/${ticket.id}`);
    }
    setLoading(false);
  };

  const handleSaveTicket = async (contactId) => {
    if (!contactId) return;

    setLoading(true);

    try {
      const { data: settingsData } = await api.get("/settings");
      const openTicketsSetting = settingsData.find(s => s.key === "openTickets")?.value;

      if (openTicketsSetting === "enabled") {
        const { data: ticketData } = await api.get(`/tickets/contact/${contactId}/open`);

        if (ticketData.hasOpenTicket) {
          const assignedUserName = ticketData.ticket?.user?.name || "Atendente desconhecido";

          setLoading(false);
          toastError({
            message: t("contacts.errors.ticketAlreadyOpen", {
              userName: assignedUserName,
            }),
          });
          return;
        }
      }

      const { data } = await api.post("/tickets", {
        contactId,
        userId: user?.id,
        status: "open",
      });

      history.push(`/tickets/${data.id}`);
    } catch (err) {
      toastError(err, t);
    } finally {
      setLoading(false);
    }
  };

  const hadleEditContact = (contactId) => {
    setSelectedContactId(contactId);
    setContactModalOpen(true);
  };

  const handleDeleteContact = async (contactId) => {
    try {
      await api.delete(`/contacts/${contactId}`);
      toast.success(t("contacts.toasts.deleted"));
    } catch (err) {
      toastError(err);
    }
    setDeletingContact(null);
    setSearchParam("");
    setPageNumber(1);
  };

  const handleDeleteAllContact = async () => {
    try {
      await api.delete("/contacts");
      toast.success(t("contacts.toasts.deletedAll"));
      history.go(0);
    } catch (err) {
      toastError(err);
    }
    setDeletingAllContact(null);
    setSearchParam("");
    setPageNumber();
  };

  const handleimportContact = async () => {
    try {
      await api.post("/contacts/import");
      history.go(0);
    } catch (err) {
      toastError(err);
    }
  };

  const loadMore = () => {
    setPageNumber((prevState) => prevState + 1);
  };

  const handleScroll = (e) => {
    if (!hasMore || loading) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - (scrollTop + 100) < clientHeight) {
      loadMore();
    }
  };

  const formatPhoneNumber = (number) => {
    if (!number) return "-";
    if (number.startsWith('55') && number.length === 13) {
      const ddd = number.slice(2, 4);
      const firstPart = number.slice(4, 9);
      const secondPart = number.slice(9);
      return `(${ddd}) ${firstPart}-${secondPart}`;
    } else if (number.startsWith('55') && number.length === 12) {
      const ddd = number.slice(2, 4);
      const firstPart = number.slice(4, 8);
      const secondPart = number.slice(8);
      return `(${ddd}) ${firstPart}-${secondPart}`;
    }

    return number;
  };

  return (
    <MainContainer className={classes.mainContainer}>
      <NewTicketModalPageContact
        modalOpen={newTicketModalOpen}
        initialContact={contactTicket}
        onClose={(ticket) => {
          handleCloseOrOpenTicket(ticket);
        }}
      />
      <ContactModal
        open={contactModalOpen}
        onClose={handleCloseContactModal}
        aria-labelledby="form-dialog-title"
        contactId={selectedContactId}
      ></ContactModal>
      <ConfirmationModal
        title={
          deletingContact ? `${t("contacts.confirmationModal.deleteTitle")} ${deletingContact.name}?`
            : deletingAllContact ? `${t("contacts.confirmationModal.deleteAllTitle")}`
              : `${t("contacts.confirmationModal.importTitle")}`
        }
        open={confirmOpen}
        onClose={setConfirmOpen}
        onConfirm={(e) =>
          deletingContact ? handleDeleteContact(deletingContact.id)
            : deletingAllContact ? handleDeleteAllContact(deletingAllContact)
              : handleimportContact()
        }
      >
        {
          deletingContact ? `${t("contacts.confirmationModal.deleteMessage")}`
            : deletingAllContact ? `${t("contacts.confirmationModal.deleteAllMessage")}`
              : `${t("contacts.confirmationModal.importMessage")}`
        }
      </ConfirmationModal>
      <MainHeader>
        <Title>{t("contacts.title")} ({contacts.length})</Title>
        <MainHeaderButtonsWrapper>
          <TextField
            placeholder={t("contacts.searchPlaceholder")}
            type="search"
            value={searchParam}
            onChange={handleSearch}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search color="secondary" />
                </InputAdornment>
              ),
            }}
          />
          <Can
            role={user.profile}
            perform="drawer-admin-items:view"
            yes={() => (
              <>
                <Tooltip title={t("contacts.buttons.import")}>
                  <Button
                    variant="contained"
                    color="primary"
                    className={classes.buttonSize}
                    onClick={(e) => setConfirmOpen(true)}
                  >
                    <ImportContacts />
                  </Button>
                </Tooltip>
              </>
            )}
          />
          <Tooltip title={t("contacts.buttons.add")}>
            <Button
              variant="contained"
              color="primary"
              className={classes.buttonSize}
              onClick={handleOpenContactModal}
            >
              <AddCircleOutline />
            </Button>
          </Tooltip>
          <Tooltip title={t("contacts.buttons.export")}>
            <CSVLink
              className={classes.csvbtn}
              separator=";"
              filename={'pressticket-contacts.csv'}
              data={
                contacts.map((contact) => ({
                  name: contact.name,
                  number: contact.number,
                  address: contact.address,
                  email: contact.email
                }))
              }>
              <Button
                variant="contained"
                color="primary">
                <Archive />
              </Button>
            </CSVLink>
          </Tooltip>
          <Can
            role={user.profile}
            perform="drawer-admin-items:view"
            yes={() => (
              <>
                <Tooltip title={t("contacts.buttons.delete")}>
                  <Button
                    variant="contained"
                    color="primary"
                    className={classes.buttonSize}
                    onClick={(e) => {
                      setConfirmOpen(true);
                      setDeletingAllContact(contacts);
                    }}
                  >
                    <DeleteForever />
                  </Button>
                </Tooltip>
              </>
            )}
          />
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <TagsFilter onFiltered={handleTagFilter} />
      <Paper
        className={classes.mainPaper}
        variant="outlined"
        onScroll={handleScroll}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox"></TableCell>
              <TableCell>{t("contacts.table.name")}</TableCell>
              <TableCell align="center">{t("contacts.table.whatsapp")}</TableCell>
              <TableCell align="center">{t("contacts.table.address")}</TableCell>
              <TableCell align="center">{t("contacts.table.channels")}</TableCell>
              <TableCell align="center">{t("contacts.table.actions")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <>
              {contacts
                .filter((contact) => {
                  if (filteredTags.length === 0) return true;
                  return (
                    contact.tags &&
                    contact.tags.length > 0 &&
                    filteredTags.every(tag => contact.tags.some(ctag => ctag.id === tag.id))
                  );
                })
                .map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell style={{ paddingRight: 0 }}>
                      <Avatar src={contact.profilePicUrl} className={classes.avatar} alt="contact_image" />
                    </TableCell>
                    <TableCell>{contact.name}</TableCell>
                    <TableCell align="center">
                      {contact.number ? (
                        <>
                          <IconButton size="small" onClick={() => handleSaveTicket(contact.id)}>
                            <Tooltip title="wwebjs" arrow placement="left" >
                              <WhatsApp style={{ color: "#075e54" }} />
                            </Tooltip>
                          </IconButton>
                          {user.isTricked === "enabled" ? formatPhoneNumber(contact.number) : formatPhoneNumber(contact.number).slice(0, -4) + "****"}
                        </>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>{contact.address}</TableCell>
                    <TableCell align="center">
                      <ContactChannels
                        contact={contact}
                        handleSaveTicket={handleSaveTicket}
                        setContactTicket={setContactTicket}
                        setNewTicketModalOpen={setNewTicketModalOpen}
                      />
                    </TableCell>
                    <TableCell align="center">
                      {contact.number && (
                        <IconButton size="small" onClick={() => hadleEditContact(contact.id)}>
                          <Edit color="secondary" />
                        </IconButton>
                      )}
                      <Can
                        role={user.profile}
                        perform="contacts-page:deleteContact"
                        yes={() => (
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              setConfirmOpen(true);
                              setDeletingContact(contact);
                            }}
                          >
                            <DeleteOutline color="secondary" />
                          </IconButton>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              {loading && <TableRowSkeleton avatar columns={3} />}
            </>
          </TableBody>
        </Table>
      </Paper >
    </MainContainer >
  );
};

export default Contacts;